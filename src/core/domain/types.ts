export type CallStatus =
  | 'INIT'
  | 'DIALING'
  | 'RINGING'
  | 'CONNECTED'
  | 'GREETING'
  | 'LISTENING'
  | 'RESPONDING'
  | 'CLOSING'
  | 'HANGUP'
  | 'COMPLETED'
  | 'FAILED';

export type FailureReason =
  | 'NO_ANSWER'
  | 'BUSY'
  | 'REJECTED'
  | 'VOICEMAIL'
  | 'CALL_DROPPED'
  | 'AI_RUNTIME_ERROR'
  | 'PROVIDER_ERROR'
  | 'TIMEOUT';

export type Speaker = 'agent' | 'human' | 'system';

export interface CallSession {
  id: string;
  toNumber: string;
  providerCallId?: string;
  status: CallStatus;
  endReason?: FailureReason;
  startedAt?: Date;
  endedAt?: Date;
  durationSec?: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface CallTurn {
  id: string;
  callSessionId: string;
  turnIndex: number;
  speaker: Speaker;
  text: string;
  confidence?: number;
  createdAt: Date;
}

export interface ConversationContext {
  callSessionId: string;
  turns: CallTurn[];
  turnCount: number;
  maxTurns: number;
}
