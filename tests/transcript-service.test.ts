import { describe, it, expect, beforeEach } from 'vitest';
import { TranscriptService } from '@/core/modules/transcript-service';
import { InMemoryCallStoreAdapter } from '@/adapters/in-memory-call-store.adapter';

describe('TranscriptService', () => {
  let store: InMemoryCallStoreAdapter;
  let service: TranscriptService;

  beforeEach(async () => {
    store = new InMemoryCallStoreAdapter();
    service = new TranscriptService(store);
    await store.createSession({ id: 'ts-1', toNumber: '+14155552671' });
  });

  it('should append human utterance', async () => {
    const turn = await service.appendHumanUtterance('ts-1', 'Hello there', 0.95);
    expect(turn.speaker).toBe('human');
    expect(turn.text).toBe('Hello there');
    expect(turn.confidence).toBe(0.95);
    expect(turn.turnIndex).toBe(0);
  });

  it('should append agent reply', async () => {
    const turn = await service.appendAgentReply('ts-1', 'Hi! How can I help?');
    expect(turn.speaker).toBe('agent');
    expect(turn.text).toBe('Hi! How can I help?');
  });

  it('should append system event', async () => {
    const turn = await service.appendSystemEvent('ts-1', 'Call started');
    expect(turn.speaker).toBe('system');
    expect(turn.text).toBe('Call started');
  });

  it('should maintain correct turn ordering', async () => {
    await service.appendAgentReply('ts-1', 'Hello!');
    await service.appendHumanUtterance('ts-1', 'Hi there');
    await service.appendAgentReply('ts-1', 'How can I help?');
    await service.appendHumanUtterance('ts-1', 'I need info');

    const transcript = await service.getTranscript('ts-1');
    expect(transcript).toHaveLength(4);
    expect(transcript[0].turnIndex).toBe(0);
    expect(transcript[1].turnIndex).toBe(1);
    expect(transcript[2].turnIndex).toBe(2);
    expect(transcript[3].turnIndex).toBe(3);
    expect(transcript[0].speaker).toBe('agent');
    expect(transcript[1].speaker).toBe('human');
    expect(transcript[2].speaker).toBe('agent');
    expect(transcript[3].speaker).toBe('human');
  });

  it('should retrieve empty transcript for session with no turns', async () => {
    await store.createSession({ id: 'ts-empty', toNumber: '+14155552671' });
    const transcript = await service.getTranscript('ts-empty');
    expect(transcript).toHaveLength(0);
  });
});
