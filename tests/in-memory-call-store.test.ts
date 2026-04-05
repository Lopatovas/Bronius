import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryCallStoreAdapter } from '@/adapters/in-memory-call-store.adapter';

describe('InMemoryCallStoreAdapter', () => {
  let store: InMemoryCallStoreAdapter;

  beforeEach(() => {
    store = new InMemoryCallStoreAdapter();
  });

  it('createSession initializes INIT and empty transcript', async () => {
    const s = await store.createSession({ id: 's1', toNumber: '+14155552671' });
    expect(s.status).toBe('INIT');
    expect(s.toNumber).toBe('+14155552671');
    const t = await store.getTranscript('s1');
    expect(t).toEqual([]);
  });

  it('appendTurn assigns monotonic turnIndex', async () => {
    await store.createSession({ id: 's2', toNumber: '+1' });
    const a = await store.appendTurn({ callSessionId: 's2', speaker: 'human', text: 'Hi' });
    const b = await store.appendTurn({ callSessionId: 's2', speaker: 'agent', text: 'Hello' });
    expect(a.turnIndex).toBe(0);
    expect(b.turnIndex).toBe(1);
    const t = await store.getTranscript('s2');
    expect(t).toHaveLength(2);
  });

  it('appendTurn throws for unknown session', async () => {
    await expect(
      store.appendTurn({ callSessionId: 'missing', speaker: 'human', text: 'x' }),
    ).rejects.toThrow('Session missing not found');
  });

  it('updateStatus throws for unknown session', async () => {
    await expect(store.updateStatus('nope', 'DIALING')).rejects.toThrow('Session nope not found');
  });

  it('updateStatus merges optional fields', async () => {
    await store.createSession({ id: 's3', toNumber: '+1' });
    const started = new Date('2026-01-01T12:00:00Z');
    const updated = await store.updateStatus('s3', 'COMPLETED', {
      providerCallId: 'CA123',
      endReason: 'CALL_DROPPED',
      startedAt: started,
      durationSec: 42,
    });
    expect(updated.status).toBe('COMPLETED');
    expect(updated.providerCallId).toBe('CA123');
    expect(updated.endReason).toBe('CALL_DROPPED');
    expect(updated.startedAt?.toISOString()).toBe(started.toISOString());
    expect(updated.durationSec).toBe(42);
  });

  it('getSession returns null for unknown id', async () => {
    expect(await store.getSession('unknown')).toBeNull();
  });

  it('clear removes all sessions and transcripts', async () => {
    await store.createSession({ id: 's4', toNumber: '+1' });
    await store.appendTurn({ callSessionId: 's4', speaker: 'human', text: 'x' });
    store.clear();
    expect(await store.getSession('s4')).toBeNull();
    expect(await store.getTranscript('s4')).toEqual([]);
  });
});
