import { BrainPort, BrainReply } from '../core/ports/brain.port';
import { ConversationContext } from '../core/domain/types';
import { pushIntegrationTrace } from '../lib/integration-trace';

export class LoggingBrainAdapter implements BrainPort {
  constructor(private inner: BrainPort) {}

  async generateReply(context: ConversationContext): Promise<BrainReply> {
    const preview = context.turns.slice(-8).map((t) => ({
      speaker: t.speaker,
      text: t.text.length > 280 ? `${t.text.slice(0, 280)}…` : t.text,
    }));

    pushIntegrationTrace({
      kind: 'brain',
      label: 'LLM request (generateReply)',
      callSessionId: context.callSessionId,
      meta: {
        turnCount: context.turnCount,
        maxTurns: context.maxTurns,
        transcriptPreview: preview,
      },
    });

    const reply = await this.inner.generateReply(context);

    pushIntegrationTrace({
      kind: 'brain',
      label: 'LLM reply',
      callSessionId: context.callSessionId,
      meta: {
        text: reply.text,
        shouldEnd: reply.shouldEnd,
        reason: reply.reason,
      },
    });

    return reply;
  }
}
