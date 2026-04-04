import { describe, it, expect, beforeEach } from 'vitest';
import { CallController, CallControllerConfig } from '@/core/modules/call-controller';
import { ConversationEngine } from '@/core/modules/conversation-engine';
import { TranscriptService } from '@/core/modules/transcript-service';
import { InMemoryCallStoreAdapter } from '@/adapters/in-memory-call-store.adapter';
import { MockBrainAdapter } from '@/adapters/mock-brain.adapter';
import { TelephonyPort, PlaceCallParams, PlaceCallResult, VoiceAction } from '@/core/ports/telephony.port';
import { NormalizedProviderEvent } from '@/core/domain/events';

class StubTelephonyAdapter implements TelephonyPort {
  async placeCall(): Promise<PlaceCallResult> {
    return { providerCallId: 'int-provider-123' };
  }
  async hangupCall(): Promise<void> {}
  normalizeProviderEvent(raw: Record<string, string>): NormalizedProviderEvent {
    const map: Record<string, NormalizedProviderEvent['type']> = {
      ringing: 'ringing', 'in-progress': 'answered', completed: 'completed',
    };
    return { type: map[raw.CallStatus] || 'failed', providerCallId: raw.CallSid || '', timestamp: new Date() };
  }
  respondWithVoiceActions(): string { return '<Response/>'; }
  validateWebhookSignature(): boolean { return true; }
}

describe('Integration: Full Call Flow', () => {
  let store: InMemoryCallStoreAdapter;
  let controller: CallController;

  beforeEach(() => {
    store = new InMemoryCallStoreAdapter();
    const telephony = new StubTelephonyAdapter();
    const brain = new MockBrainAdapter();
    const conversation = new ConversationEngine(brain, store, { maxTurns: 5 });
    const transcript = new TranscriptService(store);
    const config: CallControllerConfig = {
      fromNumber: '+15551234567',
      maxCallDurationSec: 300,
      maxSilenceRetries: 2,
    };
    controller = new CallController(telephony, store, conversation, transcript, config);
  });

  it('should run full flow: start -> answered -> gather -> reply -> close', async () => {
    // 1. Start call
    const session = await controller.initiateCall('int-1', '+14155552671', 'https://example.com');
    expect(session.status).toBe('DIALING');

    // 2. Simulate answered
    await controller.handleProviderEvent(
      { type: 'answered', providerCallId: 'int-provider-123', timestamp: new Date() },
      'int-1',
    );
    let s = await store.getSession('int-1');
    expect(s!.status).toBe('CONNECTED');

    // 3. Transition to greeting
    await controller.transitionStatus('int-1', 'GREETING');
    s = await store.getSession('int-1');
    expect(s!.status).toBe('GREETING');

    // Save greeting turn
    await store.appendTurn({
      callSessionId: 'int-1',
      speaker: 'agent',
      text: 'Hello! This is Bronius calling. How can I help you today?',
    });

    // 4. First human utterance
    const actions1 = await controller.handleGatherResult('int-1', 'I need some information', 0.92);
    expect(actions1[0].type).toBe('say');
    expect(actions1[actions1.length - 1].type).toBe('gather');

    s = await store.getSession('int-1');
    expect(['LISTENING', 'RESPONDING'].includes(s!.status)).toBe(true);

    // 5. Second human utterance
    const actions2 = await controller.handleGatherResult('int-1', 'Tell me more about pricing', 0.88);
    expect(actions2[0].type).toBe('say');

    // 6. User says goodbye
    const actions3 = await controller.handleGatherResult('int-1', 'Goodbye, thanks!', 0.95);
    const hasHangup = actions3.some((a) => a.type === 'hangup');
    expect(hasHangup).toBe(true);

    // 7. Provider sends completed event
    await controller.handleProviderEvent(
      { type: 'completed', providerCallId: 'int-provider-123', timestamp: new Date() },
      'int-1',
    );
    s = await store.getSession('int-1');
    expect(s!.status).toBe('COMPLETED');

    // 8. Verify transcript has all turns
    const transcript = await store.getTranscript('int-1');
    expect(transcript.length).toBeGreaterThanOrEqual(6);

    const humans = transcript.filter((t) => t.speaker === 'human');
    const agents = transcript.filter((t) => t.speaker === 'agent');
    expect(humans.length).toBeGreaterThanOrEqual(3);
    expect(agents.length).toBeGreaterThanOrEqual(3);

    // 9. Verify ordering
    for (let i = 1; i < transcript.length; i++) {
      expect(transcript[i].turnIndex).toBeGreaterThan(transcript[i - 1].turnIndex);
    }
  });

  it('should handle call failure gracefully and preserve partial transcript', async () => {
    await controller.initiateCall('int-fail', '+14155552671', 'https://example.com');

    await controller.handleProviderEvent(
      { type: 'answered', providerCallId: 'int-p-fail', timestamp: new Date() },
      'int-fail',
    );

    await controller.transitionStatus('int-fail', 'GREETING');
    await store.appendTurn({
      callSessionId: 'int-fail',
      speaker: 'agent',
      text: 'Hello!',
    });

    await controller.handleGatherResult('int-fail', 'Hi there', 0.9);

    // Simulate failure
    await controller.handleProviderEvent(
      { type: 'failed', providerCallId: 'int-p-fail', timestamp: new Date() },
      'int-fail',
    );

    const s = await store.getSession('int-fail');
    expect(s!.status).toBe('FAILED');

    const transcript = await store.getTranscript('int-fail');
    expect(transcript.length).toBeGreaterThanOrEqual(2);
  });
});
