import { describe, it, expect, beforeEach } from 'vitest';
import { CallController, CallControllerConfig } from '@/core/modules/call-controller';
import { ConversationEngine } from '@/core/modules/conversation-engine';
import { TranscriptService } from '@/core/modules/transcript-service';
import { InMemoryCallStoreAdapter } from '@/adapters/in-memory-call-store.adapter';
import { MockBrainAdapter } from '@/adapters/mock-brain.adapter';
import { TelephonyPort, PlaceCallParams, PlaceCallResult, VoiceAction } from '@/core/ports/telephony.port';
import { NormalizedProviderEvent } from '@/core/domain/events';

class StubTelephonyAdapter implements TelephonyPort {
  lastPlaceCallParams: PlaceCallParams | null = null;
  hangupCalled = false;

  async placeCall(params: PlaceCallParams): Promise<PlaceCallResult> {
    this.lastPlaceCallParams = params;
    return { providerCallId: 'provider-call-123' };
  }

  async hangupCall(): Promise<void> {
    this.hangupCalled = true;
  }

  normalizeProviderEvent(raw: Record<string, string>): NormalizedProviderEvent {
    const statusMap: Record<string, NormalizedProviderEvent['type']> = {
      ringing: 'ringing',
      'in-progress': 'answered',
      completed: 'completed',
      failed: 'failed',
      'no-answer': 'no-answer',
      busy: 'busy',
    };
    return {
      type: statusMap[raw.CallStatus] || 'failed',
      providerCallId: raw.CallSid || '',
      timestamp: new Date(),
    };
  }

  respondWithVoiceActions(actions: VoiceAction[]): string {
    return `<Response>${actions.map((a) => `<${a.type}/>`).join('')}</Response>`;
  }

  validateWebhookSignature(): boolean {
    return true;
  }
}

describe('CallController', () => {
  let store: InMemoryCallStoreAdapter;
  let telephony: StubTelephonyAdapter;
  let brain: MockBrainAdapter;
  let controller: CallController;

  const config: CallControllerConfig = {
    fromNumber: '+15551234567',
    webhookBaseUrl: 'https://example.com',
    maxCallDurationSec: 300,
    maxSilenceRetries: 2,
  };

  beforeEach(() => {
    store = new InMemoryCallStoreAdapter();
    telephony = new StubTelephonyAdapter();
    brain = new MockBrainAdapter();
    const conversation = new ConversationEngine(brain, store, { maxTurns: 5 });
    const transcript = new TranscriptService(store);
    controller = new CallController(telephony, store, conversation, transcript, config);
  });

  it('should create a session and transition to DIALING on initiateCall', async () => {
    const session = await controller.initiateCall('sess-1', '+14155552671');
    expect(session.status).toBe('DIALING');
    expect(session.providerCallId).toBe('provider-call-123');
  });

  it('should transition INIT -> DIALING -> RINGING -> CONNECTED', async () => {
    await controller.initiateCall('sess-2', '+14155552671');

    await controller.handleProviderEvent(
      { type: 'ringing', providerCallId: 'p-1', timestamp: new Date() },
      'sess-2',
    );
    let s = await store.getSession('sess-2');
    expect(s!.status).toBe('RINGING');

    await controller.handleProviderEvent(
      { type: 'answered', providerCallId: 'p-1', timestamp: new Date() },
      'sess-2',
    );
    s = await store.getSession('sess-2');
    expect(s!.status).toBe('CONNECTED');
  });

  it('should handle DIALING -> CONNECTED directly (skip RINGING)', async () => {
    await controller.initiateCall('sess-skip', '+14155552671');

    await controller.handleProviderEvent(
      { type: 'answered', providerCallId: 'p-1', timestamp: new Date() },
      'sess-skip',
    );
    const s = await store.getSession('sess-skip');
    expect(s!.status).toBe('CONNECTED');
  });

  it('should transition to FAILED on busy', async () => {
    await controller.initiateCall('sess-3', '+14155552671');

    await controller.handleProviderEvent(
      { type: 'busy', providerCallId: 'p-1', timestamp: new Date() },
      'sess-3',
    );
    const s = await store.getSession('sess-3');
    expect(s!.status).toBe('FAILED');
    expect(s!.endReason).toBe('BUSY');
  });

  it('should transition to FAILED on no-answer', async () => {
    await controller.initiateCall('sess-na', '+14155552671');

    await controller.handleProviderEvent(
      { type: 'no-answer', providerCallId: 'p-1', timestamp: new Date() },
      'sess-na',
    );
    const s = await store.getSession('sess-na');
    expect(s!.status).toBe('FAILED');
    expect(s!.endReason).toBe('NO_ANSWER');
  });

  it('should generate greeting with Say and Gather actions', () => {
    const actions = controller.generateGreeting('sess-4');
    expect(actions).toHaveLength(2);
    expect(actions[0].type).toBe('say');
    expect(actions[1].type).toBe('gather');
  });

  it('should handle silence with retries', async () => {
    await controller.initiateCall('sess-5', '+14155552671');
    await controller.transitionStatus('sess-5', 'CONNECTED');
    await controller.transitionStatus('sess-5', 'GREETING');
    await controller.transitionStatus('sess-5', 'LISTENING');

    const actions1 = await controller.handleGatherResult('sess-5', undefined, undefined);
    expect(actions1[0].text).toContain("didn't catch");
    expect(actions1[1].type).toBe('gather');

    const actions2 = await controller.handleGatherResult('sess-5', '', undefined);
    expect(actions2[0].text).toContain("didn't catch");

    const actions3 = await controller.handleGatherResult('sess-5', '', undefined);
    expect(actions3[0].text).toContain("haven't heard");
    expect(actions3[1].type).toBe('hangup');
  });

  it('should process speech and return agent reply', async () => {
    await controller.initiateCall('sess-6', '+14155552671');
    await controller.transitionStatus('sess-6', 'CONNECTED');
    await controller.transitionStatus('sess-6', 'GREETING');

    const actions = await controller.handleGatherResult('sess-6', 'Hello there', 0.95);
    expect(actions.length).toBeGreaterThanOrEqual(2);
    expect(actions[0].type).toBe('say');
    expect(actions[actions.length - 1].type).toBe('gather');

    const turns = await store.getTranscript('sess-6');
    const humanTurns = turns.filter((t) => t.speaker === 'human');
    expect(humanTurns).toHaveLength(1);
    expect(humanTurns[0].text).toBe('Hello there');
  });

  it('should handle goodbye from user and end call', async () => {
    await controller.initiateCall('sess-7', '+14155552671');
    await controller.transitionStatus('sess-7', 'CONNECTED');
    await controller.transitionStatus('sess-7', 'GREETING');

    const actions = await controller.handleGatherResult('sess-7', 'goodbye', 0.9);
    const hasHangup = actions.some((a) => a.type === 'hangup');
    expect(hasHangup).toBe(true);
  });

  it('should not transition to an invalid status', async () => {
    await controller.initiateCall('sess-inv', '+14155552671');

    const session = await controller.transitionStatus('sess-inv', 'LISTENING');
    expect(session.status).toBe('DIALING');
  });
});
