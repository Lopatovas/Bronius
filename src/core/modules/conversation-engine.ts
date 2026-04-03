import { BrainPort, BrainReply } from '../ports/brain.port';
import { CallStorePort } from '../ports/call-store.port';
import { log } from '../../lib/logger';

export interface ConversationEngineConfig {
  maxTurns: number;
}

export class ConversationEngine {
  constructor(
    private brain: BrainPort,
    private store: CallStorePort,
    private config: ConversationEngineConfig,
  ) {}

  async processUtterance(callSessionId: string): Promise<BrainReply> {
    const turns = await this.store.getTranscript(callSessionId);
    const humanTurns = turns.filter((t) => t.speaker === 'human');

    if (humanTurns.length >= this.config.maxTurns) {
      log.info({ callSessionId, turnCount: humanTurns.length }, 'Max turns reached');
      const endReply: BrainReply = {
        text: "We've had a great conversation, but I need to wrap up now.",
        shouldEnd: true,
        reason: 'max_turns_reached',
      };
      await this.store.appendTurn({
        callSessionId,
        speaker: 'agent',
        text: endReply.text,
      });
      return endReply;
    }

    const reply = await this.brain.generateReply({
      callSessionId,
      turns,
      turnCount: humanTurns.length,
      maxTurns: this.config.maxTurns,
    });

    await this.store.appendTurn({
      callSessionId,
      speaker: 'agent',
      text: reply.text,
    });

    log.info(
      { callSessionId, shouldEnd: reply.shouldEnd, turnCount: humanTurns.length },
      'Agent reply generated',
    );

    return reply;
  }
}
