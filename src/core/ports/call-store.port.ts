import { CallSession, CallStatus, CallTurn, FailureReason, Speaker } from '../domain/types';

export interface CreateSessionParams {
  id: string;
  toNumber: string;
}

export interface AppendTurnParams {
  callSessionId: string;
  speaker: Speaker;
  text: string;
  confidence?: number;
}

export interface CallStorePort {
  createSession(params: CreateSessionParams): Promise<CallSession>;
  updateStatus(
    callSessionId: string,
    status: CallStatus,
    extra?: {
      providerCallId?: string;
      endReason?: FailureReason;
      startedAt?: Date;
      endedAt?: Date;
      durationSec?: number;
    },
  ): Promise<CallSession>;
  appendTurn(params: AppendTurnParams): Promise<CallTurn>;
  getSession(callSessionId: string): Promise<CallSession | null>;
  getTranscript(callSessionId: string): Promise<CallTurn[]>;
  /** Recent sessions, newest first (for UI). */
  listSessions(limit: number): Promise<CallSession[]>;
}
