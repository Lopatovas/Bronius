import { CallStorePort, CreateSessionParams, AppendTurnParams } from '../core/ports/call-store.port';
import { CallSession, CallStatus, CallTurn, FailureReason } from '../core/domain/types';
import { generateId } from '../lib/id';

export class InMemoryCallStoreAdapter implements CallStorePort {
  private sessions = new Map<string, CallSession>();
  private turns = new Map<string, CallTurn[]>();

  async createSession(params: CreateSessionParams): Promise<CallSession> {
    const now = new Date();
    const session: CallSession = {
      id: params.id,
      toNumber: params.toNumber,
      status: 'INIT',
      createdAt: now,
      updatedAt: now,
    };
    this.sessions.set(params.id, session);
    this.turns.set(params.id, []);
    return { ...session };
  }

  async updateStatus(
    callSessionId: string,
    status: CallStatus,
    extra?: {
      providerCallId?: string;
      endReason?: FailureReason;
      startedAt?: Date;
      endedAt?: Date;
      durationSec?: number;
    },
  ): Promise<CallSession> {
    const session = this.sessions.get(callSessionId);
    if (!session) throw new Error(`Session ${callSessionId} not found`);

    session.status = status;
    session.updatedAt = new Date();
    if (extra?.providerCallId) session.providerCallId = extra.providerCallId;
    if (extra?.endReason) session.endReason = extra.endReason;
    if (extra?.startedAt) session.startedAt = extra.startedAt;
    if (extra?.endedAt) session.endedAt = extra.endedAt;
    if (extra?.durationSec !== undefined) session.durationSec = extra.durationSec;

    return { ...session };
  }

  async appendTurn(params: AppendTurnParams): Promise<CallTurn> {
    const sessionTurns = this.turns.get(params.callSessionId);
    if (!sessionTurns) throw new Error(`Session ${params.callSessionId} not found`);

    const turn: CallTurn = {
      id: generateId(),
      callSessionId: params.callSessionId,
      turnIndex: sessionTurns.length,
      speaker: params.speaker,
      text: params.text,
      confidence: params.confidence,
      createdAt: new Date(),
    };

    sessionTurns.push(turn);
    return { ...turn };
  }

  async getSession(callSessionId: string): Promise<CallSession | null> {
    const session = this.sessions.get(callSessionId);
    return session ? { ...session } : null;
  }

  async getTranscript(callSessionId: string): Promise<CallTurn[]> {
    const sessionTurns = this.turns.get(callSessionId);
    return sessionTurns ? sessionTurns.map((t) => ({ ...t })) : [];
  }

  async listSessions(limit: number): Promise<CallSession[]> {
    const sorted = [...this.sessions.values()].sort(
      (a, b) => b.updatedAt.getTime() - a.updatedAt.getTime(),
    );
    return sorted.slice(0, Math.max(0, limit)).map((s) => ({ ...s }));
  }

  clear(): void {
    this.sessions.clear();
    this.turns.clear();
  }
}
