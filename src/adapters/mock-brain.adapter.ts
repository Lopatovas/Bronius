import { BrainPort, BrainReply } from '../core/ports/brain.port';
import { ConversationContext } from '../core/domain/types';

const MOCK_REPLIES = [
  "That's interesting! Tell me more about that.",
  "I understand. Is there anything else you'd like to discuss?",
  'Thanks for sharing that with me. What else is on your mind?',
  "I appreciate you telling me that. How can I help further?",
  "That makes sense. Would you like to explore that topic more?",
];

export class MockBrainAdapter implements BrainPort {
  async generateReply(context: ConversationContext): Promise<BrainReply> {
    const lastHumanTurn = [...context.turns].reverse().find((t) => t.speaker === 'human');
    const text = lastHumanTurn?.text?.toLowerCase() || '';

    if (text.includes('bye') || text.includes('goodbye') || text.includes('done') || text.includes('that\'s all')) {
      return {
        text: "It was great talking with you!",
        shouldEnd: true,
        reason: 'user_goodbye',
      };
    }

    if (context.turnCount >= context.maxTurns - 1) {
      return {
        text: "We've had a wonderful conversation. I hope I was helpful!",
        shouldEnd: true,
        reason: 'max_turns_approaching',
      };
    }

    const replyIndex = context.turnCount % MOCK_REPLIES.length;
    return {
      text: MOCK_REPLIES[replyIndex],
      shouldEnd: false,
    };
  }
}
