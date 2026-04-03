import { describe, it, expect, beforeEach } from 'vitest';
import { ConversationEngine } from '@/core/modules/conversation-engine';
import { InMemoryCallStoreAdapter } from '@/adapters/in-memory-call-store.adapter';
import { MockBrainAdapter } from '@/adapters/mock-brain.adapter';

describe('ConversationEngine', () => {
  let store: InMemoryCallStoreAdapter;
  let brain: MockBrainAdapter;
  let engine: ConversationEngine;

  beforeEach(() => {
    store = new InMemoryCallStoreAdapter();
    brain = new MockBrainAdapter();
    engine = new ConversationEngine(brain, store, { maxTurns: 3 });
  });

  it('should generate a reply and save agent turn', async () => {
    await store.createSession({ id: 'ce-1', toNumber: '+14155552671' });
    await store.appendTurn({ callSessionId: 'ce-1', speaker: 'human', text: 'Hi there' });

    const reply = await engine.processUtterance('ce-1');
    expect(reply.text).toBeTruthy();
    expect(reply.shouldEnd).toBe(false);

    const turns = await store.getTranscript('ce-1');
    const agentTurns = turns.filter((t) => t.speaker === 'agent');
    expect(agentTurns).toHaveLength(1);
  });

  it('should end conversation when max turns reached', async () => {
    await store.createSession({ id: 'ce-2', toNumber: '+14155552671' });
    await store.appendTurn({ callSessionId: 'ce-2', speaker: 'human', text: 'Turn 1' });
    await store.appendTurn({ callSessionId: 'ce-2', speaker: 'agent', text: 'Reply 1' });
    await store.appendTurn({ callSessionId: 'ce-2', speaker: 'human', text: 'Turn 2' });
    await store.appendTurn({ callSessionId: 'ce-2', speaker: 'agent', text: 'Reply 2' });
    await store.appendTurn({ callSessionId: 'ce-2', speaker: 'human', text: 'Turn 3' });

    const reply = await engine.processUtterance('ce-2');
    expect(reply.shouldEnd).toBe(true);
    expect(reply.reason).toBe('max_turns_reached');
  });

  it('should end when user says goodbye', async () => {
    await store.createSession({ id: 'ce-3', toNumber: '+14155552671' });
    await store.appendTurn({ callSessionId: 'ce-3', speaker: 'human', text: 'goodbye' });

    const reply = await engine.processUtterance('ce-3');
    expect(reply.shouldEnd).toBe(true);
    expect(reply.reason).toBe('user_goodbye');
  });

  it('should continue conversation on normal input', async () => {
    await store.createSession({ id: 'ce-4', toNumber: '+14155552671' });
    await store.appendTurn({
      callSessionId: 'ce-4',
      speaker: 'human',
      text: 'Tell me about your features',
    });

    const reply = await engine.processUtterance('ce-4');
    expect(reply.shouldEnd).toBe(false);
    expect(reply.text).toBeTruthy();
  });
});
