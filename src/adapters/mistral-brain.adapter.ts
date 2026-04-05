import OpenAI from 'openai';
import { BrainPort, BrainReply } from '../core/ports/brain.port';
import { ConversationContext } from '../core/domain/types';

const SYSTEM_PROMPT = `You are Bronius, a friendly and professional AI phone assistant.
Keep responses concise (1-3 sentences) since this is a phone conversation.
Be helpful but direct. If the user seems done or says goodbye, set shouldEnd to true.
Respond in JSON format: { "text": "your response", "shouldEnd": false, "reason": "optional" }`;

const MISTRAL_API_BASE = 'https://api.mistral.ai/v1';

export class MistralBrainAdapter implements BrainPort {
  private client: OpenAI;
  private model: string;

  constructor(apiKey: string, model = 'mistral-small-latest') {
    this.client = new OpenAI({
      apiKey,
      baseURL: MISTRAL_API_BASE,
    });
    this.model = model;
  }

  async generateReply(context: ConversationContext): Promise<BrainReply> {
    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'system',
        content: `Turn ${context.turnCount} of ${context.maxTurns}. ${
          context.turnCount >= context.maxTurns - 1
            ? 'This is nearly the last turn, wrap up the conversation.'
            : ''
        }`,
      },
    ];

    for (const turn of context.turns) {
      if (turn.speaker === 'human') {
        messages.push({ role: 'user', content: turn.text });
      } else if (turn.speaker === 'agent') {
        messages.push({ role: 'assistant', content: turn.text });
      }
    }

    const response = await this.client.chat.completions.create({
      model: this.model,
      messages,
      temperature: 0.7,
      max_tokens: 200,
      response_format: { type: 'json_object' },
    });

    const content = response.choices[0]?.message?.content || '';

    try {
      const parsed = JSON.parse(content);
      return {
        text: parsed.text || 'I apologize, could you repeat that?',
        shouldEnd: Boolean(parsed.shouldEnd),
        reason: parsed.reason,
      };
    } catch {
      return {
        text: content || 'I apologize, could you repeat that?',
        shouldEnd: false,
      };
    }
  }
}
