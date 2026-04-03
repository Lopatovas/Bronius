import { CallStorePort } from '../ports/call-store.port';
import { CallTurn } from '../domain/types';
import { log } from '../../lib/logger';

export class TranscriptService {
  constructor(private store: CallStorePort) {}

  async appendHumanUtterance(
    callSessionId: string,
    text: string,
    confidence?: number,
  ): Promise<CallTurn> {
    log.info({ callSessionId, text: text.substring(0, 50) }, 'Appending human utterance');
    return this.store.appendTurn({
      callSessionId,
      speaker: 'human',
      text,
      confidence,
    });
  }

  async appendAgentReply(callSessionId: string, text: string): Promise<CallTurn> {
    log.info({ callSessionId, text: text.substring(0, 50) }, 'Appending agent reply');
    return this.store.appendTurn({
      callSessionId,
      speaker: 'agent',
      text,
    });
  }

  async appendSystemEvent(callSessionId: string, text: string): Promise<CallTurn> {
    return this.store.appendTurn({
      callSessionId,
      speaker: 'system',
      text,
    });
  }

  async getTranscript(callSessionId: string): Promise<CallTurn[]> {
    return this.store.getTranscript(callSessionId);
  }
}
