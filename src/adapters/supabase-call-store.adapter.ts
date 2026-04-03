import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { CallStorePort, CreateSessionParams, AppendTurnParams } from '../core/ports/call-store.port';
import { CallSession, CallStatus, CallTurn, FailureReason } from '../core/domain/types';
import { generateId } from '../lib/id';

export class SupabaseCallStoreAdapter implements CallStorePort {
  private client: SupabaseClient;

  constructor(supabaseUrl: string, supabaseServiceKey: string) {
    this.client = createClient(supabaseUrl, supabaseServiceKey);
  }

  async createSession(params: CreateSessionParams): Promise<CallSession> {
    const now = new Date().toISOString();
    const { data, error } = await this.client
      .from('call_sessions')
      .insert({
        id: params.id,
        to_number: params.toNumber,
        status: 'INIT',
        created_at: now,
        updated_at: now,
      })
      .select()
      .single();

    if (error) throw new Error(`Supabase createSession: ${error.message}`);
    return this.mapSessionRow(data);
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
    const updates: Record<string, unknown> = {
      status,
      updated_at: new Date().toISOString(),
    };

    if (extra?.providerCallId) updates.provider_call_id = extra.providerCallId;
    if (extra?.endReason) updates.end_reason = extra.endReason;
    if (extra?.startedAt) updates.started_at = extra.startedAt.toISOString();
    if (extra?.endedAt) updates.ended_at = extra.endedAt.toISOString();
    if (extra?.durationSec !== undefined) updates.duration_sec = extra.durationSec;

    const { data, error } = await this.client
      .from('call_sessions')
      .update(updates)
      .eq('id', callSessionId)
      .select()
      .single();

    if (error) throw new Error(`Supabase updateStatus: ${error.message}`);
    return this.mapSessionRow(data);
  }

  async appendTurn(params: AppendTurnParams): Promise<CallTurn> {
    const { data: existing, error: countError } = await this.client
      .from('call_turns')
      .select('turn_index')
      .eq('call_session_id', params.callSessionId)
      .order('turn_index', { ascending: false })
      .limit(1);

    if (countError) throw new Error(`Supabase appendTurn count: ${countError.message}`);

    const turnIndex = existing && existing.length > 0 ? existing[0].turn_index + 1 : 0;
    const id = generateId();

    const { data, error } = await this.client
      .from('call_turns')
      .insert({
        id,
        call_session_id: params.callSessionId,
        turn_index: turnIndex,
        speaker: params.speaker,
        text: params.text,
        confidence: params.confidence ?? null,
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) throw new Error(`Supabase appendTurn: ${error.message}`);
    return this.mapTurnRow(data);
  }

  async getSession(callSessionId: string): Promise<CallSession | null> {
    const { data, error } = await this.client
      .from('call_sessions')
      .select()
      .eq('id', callSessionId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw new Error(`Supabase getSession: ${error.message}`);
    }
    return this.mapSessionRow(data);
  }

  async getTranscript(callSessionId: string): Promise<CallTurn[]> {
    const { data, error } = await this.client
      .from('call_turns')
      .select()
      .eq('call_session_id', callSessionId)
      .order('turn_index', { ascending: true });

    if (error) throw new Error(`Supabase getTranscript: ${error.message}`);
    return (data ?? []).map((r) => this.mapTurnRow(r));
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
}
