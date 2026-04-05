import { describe, it, expect } from 'vitest';
import { MockBrainAdapter } from '@/adapters/mock-brain.adapter';
import type { ConversationContext } from '@/core/domain/types';

function ctx(partial: Partial<ConversationContext> & Pick<ConversationContext, 'turns' | 'turnCount' | 'maxTurns'>): ConversationContext {
  return {
    callSessionId: 'c1',
    ...partial,
  };
}

describe('MockBrainAdapter', () => {
  const brain = new MockBrainAdapter();

  it('returns user_goodbye when last human text includes goodbye', async () => {
    const reply = await brain.generateReply(
      ctx({
        turns: [{ id: '1', callSessionId: 'c1', turnIndex: 0, speaker: 'human', text: 'goodbye', createdAt: new Date() }],
        turnCount: 1,
        maxTurns: 10,
      }),
    );
    expect(reply.shouldEnd).toBe(true);
    expect(reply.reason).toBe('user_goodbye');
    expect(reply.text).toContain('great talking');
  });

  it('treats "bye" as goodbye', async () => {
    const reply = await brain.generateReply(
      ctx({
        turns: [
          {
            id: '1',
            callSessionId: 'c1',
            turnIndex: 0,
            speaker: 'human',
            text: 'bye for now',
            createdAt: new Date(),
          },
        ],
        turnCount: 1,
        maxTurns: 10,
      }),
    );
    expect(reply.shouldEnd).toBe(true);
  });

  it('treats "done" and that\'s all as goodbye', async () => {
    for (const text of ["I'm done", "that's all for today"]) {
      const reply = await brain.generateReply(
        ctx({
          turns: [
            {
              id: '1',
              callSessionId: 'c1',
              turnIndex: 0,
              speaker: 'human',
              text,
              createdAt: new Date(),
            },
          ],
          turnCount: 1,
          maxTurns: 10,
        }),
      );
      expect(reply.shouldEnd).toBe(true);
    }
  });

  it('uses max_turns_approaching when at last allowed human turn', async () => {
    const reply = await brain.generateReply(
      ctx({
        turns: [
          {
            id: '1',
            callSessionId: 'c1',
            turnIndex: 0,
            speaker: 'human',
            text: 'Still talking',
            createdAt: new Date(),
          },
        ],
        turnCount: 3,
        maxTurns: 3,
      }),
    );
    expect(reply.shouldEnd).toBe(true);
    expect(reply.reason).toBe('max_turns_approaching');
  });

  it('returns a rotating canned reply when not ending', async () => {
    const reply = await brain.generateReply(
      ctx({
        turns: [
          {
            id: '1',
            callSessionId: 'c1',
            turnIndex: 0,
            speaker: 'human',
            text: 'Tell me about widgets',
            createdAt: new Date(),
          },
        ],
        turnCount: 1,
        maxTurns: 10,
      }),
    );
    expect(reply.shouldEnd).toBe(false);
    expect(reply.text.length).toBeGreaterThan(0);
  });
});
