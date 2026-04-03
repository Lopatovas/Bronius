import { ConversationContext } from '../domain/types';

export interface BrainReply {
  text: string;
  shouldEnd: boolean;
  reason?: string;
}

export interface BrainPort {
  generateReply(context: ConversationContext): Promise<BrainReply>;
}
