import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OpenAIBrainAdapter } from '@/adapters/openai-brain.adapter';
import { MistralBrainAdapter } from '@/adapters/mistral-brain.adapter';
import type { ConversationContext } from '@/core/domain/types';

const mockCreate = vi.fn();

vi.mock('openai', () => ({
  __esModule: true,
  default: class MockOpenAI {
    chat = {
      completions: {
        create: (args: unknown) => mockCreate(args),
      },
    };
    constructor(_opts?: unknown) {}
  },
}));

const baseContext: ConversationContext = {
  callSessionId: 'call-1',
  turns: [
    {
      id: 't0',
      callSessionId: 'call-1',
      turnIndex: 0,
      speaker: 'human',
      text: 'Hello',
      createdAt: new Date(),
    },
  ],
  turnCount: 1,
  maxTurns: 10,
};

describe('OpenAIBrainAdapter', () => {
  beforeEach(() => {
    mockCreate.mockReset();
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: '{"text":"Hi there","shouldEnd":false}' } }],
    });
  });

  it('calls chat.completions.create with gpt-4o-mini and JSON mode', async () => {
    const adapter = new OpenAIBrainAdapter('sk-test');
    await adapter.generateReply(baseContext);

    expect(mockCreate).toHaveBeenCalledTimes(1);
    const arg = mockCreate.mock.calls[0][0] as { model: string; response_format: { type: string } };
    expect(arg.model).toBe('gpt-4o-mini');
    expect(arg.response_format).toEqual({ type: 'json_object' });
  });

  it('parses JSON content into BrainReply', async () => {
    const adapter = new OpenAIBrainAdapter('sk-test');
    const reply = await adapter.generateReply(baseContext);
    expect(reply.text).toBe('Hi there');
    expect(reply.shouldEnd).toBe(false);
  });

  it('falls back when content is not valid JSON', async () => {
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: 'Plain text reply' } }],
    });
    const adapter = new OpenAIBrainAdapter('sk-test');
    const reply = await adapter.generateReply(baseContext);
    expect(reply.text).toBe('Plain text reply');
    expect(reply.shouldEnd).toBe(false);
  });

  it('uses apology when message content is empty', async () => {
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: '' } }],
    });
    const adapter = new OpenAIBrainAdapter('sk-test');
    const reply = await adapter.generateReply(baseContext);
    expect(reply.text).toContain('apologize');
  });
});

describe('MistralBrainAdapter', () => {
  beforeEach(() => {
    mockCreate.mockReset();
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: '{"text":"Bonjour","shouldEnd":true,"reason":"test"}' } }],
    });
  });

  it('calls chat.completions.create with mistral model', async () => {
    const adapter = new MistralBrainAdapter('mistral-key', 'mistral-small-latest');
    await adapter.generateReply(baseContext);

    const arg = mockCreate.mock.calls[0][0] as { model: string };
    expect(arg.model).toBe('mistral-small-latest');
  });

  it('parses JSON including shouldEnd and reason', async () => {
    const adapter = new MistralBrainAdapter('mistral-key');
    const reply = await adapter.generateReply(baseContext);
    expect(reply.text).toBe('Bonjour');
    expect(reply.shouldEnd).toBe(true);
    expect(reply.reason).toBe('test');
  });
});
