import { Pool } from 'pg';
import { CallStorePort, CreateSessionParams, AppendTurnParams } from '../core/ports/call-store.port';
import { CallSession, CallStatus, CallTurn, FailureReason } from '../core/domain/types';
import { generateId } from '../lib/id';

export class PostgresCallStoreAdapter implements CallStorePort {
  private pool: Pool;

  constructor(connectionString: string) {
    this.pool = new Pool({ connectionString });
  }

  async createSession(params: CreateSessionParams): Promise<CallSession> {
    const result = await this.pool.query(
      `INSERT INTO call_sessions (id, to_number, status, created_at, updated_at)
       VALUES ($1, $2, 'INIT', NOW(), NOW())
       RETURNING *`,
      [params.id, params.toNumber],
    );
    return this.mapSessionRow(result.rows[0]);
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
    const setClauses = ['status = $2', 'updated_at = NOW()'];
    const params: unknown[] = [callSessionId, status];
    let idx = 3;

    if (extra?.providerCallId) {
      setClauses.push(`provider_call_id = $${idx}`);
      params.push(extra.providerCallId);
      idx++;
    }
    if (extra?.endReason) {
      setClauses.push(`end_reason = $${idx}`);
      params.push(extra.endReason);
      idx++;
    }
    if (extra?.startedAt) {
      setClauses.push(`started_at = $${idx}`);
      params.push(extra.startedAt);
      idx++;
    }
    if (extra?.endedAt) {
      setClauses.push(`ended_at = $${idx}`);
      params.push(extra.endedAt);
      idx++;
    }
    if (extra?.durationSec !== undefined) {
      setClauses.push(`duration_sec = $${idx}`);
      params.push(extra.durationSec);
      idx++;
    }

    const result = await this.pool.query(
      `UPDATE call_sessions SET ${setClauses.join(', ')} WHERE id = $1 RETURNING *`,
      params,
    );

    if (result.rows.length === 0) {
      throw new Error(`Session ${callSessionId} not found`);
    }

    return this.mapSessionRow(result.rows[0]);
  }

  async appendTurn(params: AppendTurnParams): Promise<CallTurn> {
    const turnIndexResult = await this.pool.query(
      `SELECT COALESCE(MAX(turn_index), -1) + 1 AS next_index
       FROM call_turns WHERE call_session_id = $1`,
      [params.callSessionId],
    );
    const turnIndex = turnIndexResult.rows[0].next_index;

    const id = generateId();
    const result = await this.pool.query(
      `INSERT INTO call_turns (id, call_session_id, turn_index, speaker, text, confidence, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())
       RETURNING *`,
      [id, params.callSessionId, turnIndex, params.speaker, params.text, params.confidence ?? null],
    );

    return this.mapTurnRow(result.rows[0]);
  }

  async getSession(callSessionId: string): Promise<CallSession | null> {
    const result = await this.pool.query('SELECT * FROM call_sessions WHERE id = $1', [
      callSessionId,
    ]);
    return result.rows.length > 0 ? this.mapSessionRow(result.rows[0]) : null;
  }

  async getTranscript(callSessionId: string): Promise<CallTurn[]> {
    const result = await this.pool.query(
      'SELECT * FROM call_turns WHERE call_session_id = $1 ORDER BY turn_index ASC',
      [callSessionId],
    );
    return result.rows.map((r: Record<string, unknown>) => this.mapTurnRow(r));
  }

  private mapSessionRow(row: Record<string, unknown>): CallSession {
    return {
      id: row.id as string,
      toNumber: row.to_number as string,
      providerCallId: row.provider_call_id as string | undefined,
      status: row.status as CallStatus,
      endReason: row.end_reason as FailureReason | undefined,
      startedAt: row.started_at ? new Date(row.started_at as string) : undefined,
      endedAt: row.ended_at ? new Date(row.ended_at as string) : undefined,
      durationSec: row.duration_sec as number | undefined,
      createdAt: new Date(row.created_at as string),
      updatedAt: new Date(row.updated_at as string),
    };
  }

  private mapTurnRow(row: Record<string, unknown>): CallTurn {
    return {
      id: row.id as string,
      callSessionId: row.call_session_id as string,
      turnIndex: row.turn_index as number,
      speaker: row.speaker as CallTurn['speaker'],
      text: row.text as string,
      confidence: row.confidence as number | undefined,
      createdAt: new Date(row.created_at as string),
    };
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
