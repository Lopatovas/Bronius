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
    return { providerCallId: 'provider-dup-123' };
  }
  async hangupCall(): Promise<void> {}
  normalizeProviderEvent(raw: Record<string, string>): NormalizedProviderEvent {
    const map: Record<string, NormalizedProviderEvent['type']> = {
      initiated: 'initiated',
      queued: 'queued',
      ringing: 'ringing',
      'in-progress': 'answered',
      completed: 'completed',
    };
    return { type: map[raw.CallStatus] || 'failed', providerCallId: raw.CallSid || '', timestamp: new Date() };
  }
  respondWithVoiceActions(_actions: VoiceAction[], _options?: unknown): string { return '<Response/>'; }
  validateWebhookSignature(): boolean { return true; }
}

describe('Idempotent Event Handling', () => {
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

  it('should handle duplicate ringing events idempotently', async () => {
    await controller.initiateCall('dup-1', '+14155552671', 'https://example.com');

    const event: NormalizedProviderEvent = {
      type: 'ringing',
      providerCallId: 'p-1',
      timestamp: new Date(),
    };

    await controller.handleProviderEvent(event, 'dup-1');
    const s1 = await store.getSession('dup-1');
    expect(s1!.status).toBe('RINGING');

    await controller.handleProviderEvent(event, 'dup-1');
    const s2 = await store.getSession('dup-1');
    expect(s2!.status).toBe('RINGING');
  });

  it('should handle duplicate answered events without error', async () => {
    await controller.initiateCall('dup-2', '+14155552671', 'https://example.com');

    await controller.handleProviderEvent(
      { type: 'answered', providerCallId: 'p-2', timestamp: new Date() },
      'dup-2',
    );
    const s1 = await store.getSession('dup-2');
    expect(s1!.status).toBe('CONNECTED');

    await controller.handleProviderEvent(
      { type: 'answered', providerCallId: 'p-2', timestamp: new Date() },
      'dup-2',
    );
    const s2 = await store.getSession('dup-2');
    expect(s2!.status).toBe('CONNECTED');
  });

  it('should not regress status on out-of-order events', async () => {
    await controller.initiateCall('dup-3', '+14155552671', 'https://example.com');

    await controller.handleProviderEvent(
      { type: 'answered', providerCallId: 'p-3', timestamp: new Date() },
      'dup-3',
    );
    const s1 = await store.getSession('dup-3');
    expect(s1!.status).toBe('CONNECTED');

    await controller.handleProviderEvent(
      { type: 'ringing', providerCallId: 'p-3', timestamp: new Date() },
      'dup-3',
    );
    const s2 = await store.getSession('dup-3');
    expect(s2!.status).toBe('CONNECTED');
  });
});
