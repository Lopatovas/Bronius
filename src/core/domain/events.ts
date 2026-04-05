import { CallStatus, FailureReason } from './types';

interface BaseEvent {
  callSessionId: string;
  timestamp: Date;
}

export interface CallRequested extends BaseEvent {
  type: 'CallRequested';
  toNumber: string;
}

export interface CallRinging extends BaseEvent {
  type: 'CallRinging';
  providerCallId: string;
}

export interface CallAnswered extends BaseEvent {
  type: 'CallAnswered';
  providerCallId: string;
}

export interface HumanUtteranceCaptured extends BaseEvent {
  type: 'HumanUtteranceCaptured';
  text: string;
  confidence?: number;
}

export interface AgentReplyGenerated extends BaseEvent {
  type: 'AgentReplyGenerated';
  text: string;
  shouldEnd: boolean;
}

export interface CallEnded extends BaseEvent {
  type: 'CallEnded';
  reason?: FailureReason;
  durationSec?: number;
}

export interface CallFailed extends BaseEvent {
  type: 'CallFailed';
  reason: FailureReason;
  errorMessage?: string;
}

export type DomainEvent =
  | CallRequested
  | CallRinging
  | CallAnswered
  | HumanUtteranceCaptured
  | AgentReplyGenerated
  | CallEnded
  | CallFailed;

export interface NormalizedProviderEvent {
  type:
    | 'initiated'
    | 'queued'
    | 'ringing'
    | 'answered'
    | 'completed'
    | 'failed'
    | 'no-answer'
    | 'busy'
    | 'canceled';
  providerCallId: string;
  callSessionId?: string;
  timestamp: Date;
  raw?: Record<string, unknown>;
}
