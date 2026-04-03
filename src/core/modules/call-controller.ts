import { CallSession, CallStatus, FailureReason } from '../domain/types';
import { NormalizedProviderEvent } from '../domain/events';
import { isValidTransition } from '../domain/transitions';
import { CallStorePort } from '../ports/call-store.port';
import { TelephonyPort, VoiceAction } from '../ports/telephony.port';
import { ConversationEngine } from './conversation-engine';
import { TranscriptService } from './transcript-service';
import { log } from '../../lib/logger';

export interface CallControllerConfig {
  fromNumber: string;
  maxCallDurationSec: number;
  maxSilenceRetries: number;
}

export class CallController {
  private silenceRetries = new Map<string, number>();

  constructor(
    private telephony: TelephonyPort,
    private store: CallStorePort,
    private conversation: ConversationEngine,
    private transcript: TranscriptService,
    private config: CallControllerConfig,
  ) {}

  async initiateCall(callSessionId: string, toNumber: string, webhookBaseUrl: string): Promise<CallSession> {
    const session = await this.store.createSession({ id: callSessionId, toNumber });
    log.info({ callSessionId }, 'Call session created');

    await this.transitionStatus(callSessionId, 'DIALING');

    try {
      const { providerCallId } = await this.telephony.placeCall({
        toNumber,
        fromNumber: this.config.fromNumber,
        callSessionId,
        webhookBaseUrl,
      });

      await this.store.updateStatus(callSessionId, 'DIALING', { providerCallId });
      log.info({ callSessionId, providerCallId }, 'Call placed with provider');

      return (await this.store.getSession(callSessionId))!;
    } catch (err) {
      log.error({ callSessionId, err }, 'Failed to place call');
      await this.transitionStatus(callSessionId, 'FAILED', { endReason: 'PROVIDER_ERROR' });
      throw err;
    }
  }

  async handleProviderEvent(event: NormalizedProviderEvent, callSessionId: string): Promise<void> {
    log.info({ callSessionId, eventType: event.type, providerCallId: event.providerCallId }, 'Provider event received');

    switch (event.type) {
      case 'ringing':
        await this.transitionStatus(callSessionId, 'RINGING', {
          providerCallId: event.providerCallId,
        });
        break;
      case 'answered':
        await this.transitionStatus(callSessionId, 'CONNECTED', {
          providerCallId: event.providerCallId,
          startedAt: event.timestamp,
        });
        break;
      case 'completed':
        await this.handleCallCompleted(callSessionId);
        break;
      case 'failed':
        await this.transitionStatus(callSessionId, 'FAILED', {
          endReason: 'PROVIDER_ERROR',
          endedAt: event.timestamp,
        });
        break;
      case 'no-answer':
        await this.transitionStatus(callSessionId, 'FAILED', {
          endReason: 'NO_ANSWER',
          endedAt: event.timestamp,
        });
        break;
      case 'busy':
        await this.transitionStatus(callSessionId, 'FAILED', {
          endReason: 'BUSY',
          endedAt: event.timestamp,
        });
        break;
      case 'canceled':
        await this.transitionStatus(callSessionId, 'FAILED', {
          endReason: 'REJECTED',
          endedAt: event.timestamp,
        });
        break;
    }
  }

  generateGreeting(callSessionId: string): VoiceAction[] {
    return [
      {
        type: 'say',
        text: 'Hello! This is Bronius calling. How can I help you today?',
      },
      {
        type: 'gather',
        gatherOptions: {
          input: 'speech',
          speechTimeout: 'auto',
          timeout: 5,
          actionPath: `/api/v1/telephony/gather?callSessionId=${callSessionId}`,
          actionOnEmptyResult: true,
        },
      },
    ];
  }

  async handleGatherResult(
    callSessionId: string,
    speechResult: string | undefined,
    confidence: number | undefined,
  ): Promise<VoiceAction[]> {
    const session = await this.store.getSession(callSessionId);
    if (!session) {
      log.error({ callSessionId }, 'Session not found during gather');
      return [{ type: 'say', text: 'An error occurred. Goodbye.' }, { type: 'hangup' }];
    }

    if (!speechResult || speechResult.trim() === '') {
      return this.handleSilence(callSessionId);
    }

    this.silenceRetries.delete(callSessionId);

    await this.transcript.appendHumanUtterance(callSessionId, speechResult, confidence);

    const currentStatus = (await this.store.getSession(callSessionId))!.status;
    if (currentStatus === 'GREETING' || currentStatus === 'CONNECTED') {
      await this.transitionStatus(callSessionId, 'LISTENING');
    }

    try {
      const reply = await this.conversation.processUtterance(callSessionId);

      if (reply.shouldEnd) {
        await this.transitionStatus(callSessionId, 'CLOSING');
        return [
          { type: 'say', text: reply.text },
          { type: 'say', text: 'Thank you for your time. Goodbye!' },
          { type: 'hangup' },
        ];
      }

      await this.transitionStatus(callSessionId, 'RESPONDING');

      return [
        { type: 'say', text: reply.text },
        {
          type: 'gather',
          gatherOptions: {
            input: 'speech',
            speechTimeout: 'auto',
            timeout: 5,
            actionPath: `/api/v1/telephony/gather?callSessionId=${callSessionId}`,
            actionOnEmptyResult: true,
          },
        },
      ];
    } catch (err) {
      log.error({ callSessionId, err }, 'AI processing failed');
      await this.transitionStatus(callSessionId, 'FAILED', { endReason: 'AI_RUNTIME_ERROR' });
      return [{ type: 'say', text: 'I encountered an error. Goodbye.' }, { type: 'hangup' }];
    }
  }

  private handleSilence(callSessionId: string): VoiceAction[] {
    const retries = this.silenceRetries.get(callSessionId) ?? 0;
    if (retries >= this.config.maxSilenceRetries) {
      this.silenceRetries.delete(callSessionId);
      return [
        { type: 'say', text: "I haven't heard anything. I'll let you go. Goodbye!" },
        { type: 'hangup' },
      ];
    }
    this.silenceRetries.set(callSessionId, retries + 1);
    return [
      { type: 'say', text: "I didn't catch that. Could you please repeat?" },
      {
        type: 'gather',
        gatherOptions: {
          input: 'speech',
          speechTimeout: 'auto',
          timeout: 5,
          actionPath: `/api/v1/telephony/gather?callSessionId=${callSessionId}`,
          actionOnEmptyResult: true,
        },
      },
    ];
  }

  private async handleCallCompleted(callSessionId: string): Promise<void> {
    const session = await this.store.getSession(callSessionId);
    if (!session) return;

    const now = new Date();
    const durationSec = session.startedAt
      ? Math.round((now.getTime() - session.startedAt.getTime()) / 1000)
      : undefined;

    if (session.status !== 'COMPLETED' && session.status !== 'FAILED') {
      if (session.status !== 'HANGUP') {
        await this.transitionStatus(callSessionId, 'HANGUP');
      }
      await this.transitionStatus(callSessionId, 'COMPLETED', {
        endedAt: now,
        durationSec,
      });
    }
  }

  async transitionStatus(
    callSessionId: string,
    newStatus: CallStatus,
    extra?: {
      providerCallId?: string;
      endReason?: FailureReason;
      startedAt?: Date;
      endedAt?: Date;
      durationSec?: number;
    },
  ): Promise<CallSession> {
    const session = await this.store.getSession(callSessionId);
    if (!session) {
      throw new Error(`Session ${callSessionId} not found`);
    }

    if (session.status === newStatus) {
      log.debug({ callSessionId, status: newStatus }, 'Already in target status, skipping');
      return session;
    }

    if (newStatus === 'FAILED') {
      const updated = await this.store.updateStatus(callSessionId, newStatus, extra);
      log.info({ callSessionId, from: session.status, to: newStatus }, 'Status transition (forced FAILED)');
      return updated;
    }

    if (!isValidTransition(session.status, newStatus)) {
      log.warn(
        { callSessionId, from: session.status, to: newStatus },
        'Invalid status transition, skipping',
      );
      return session;
    }

    const updated = await this.store.updateStatus(callSessionId, newStatus, extra);
    log.info({ callSessionId, from: session.status, to: newStatus }, 'Status transition');
    return updated;
  }
}
