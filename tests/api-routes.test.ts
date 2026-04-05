import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { resetProviders } from '@/core/modules/provider-registry';
import { resetContainer } from '@/lib/container';
import { generateId } from '@/lib/id';

function resetAll() {
  resetContainer();
  resetProviders();
}

describe('debug API routes', () => {
  beforeEach(() => {
    resetAll();
    vi.unstubAllEnvs();
  });

  describe('POST /api/v1/debug/supabase-ping', () => {
    it('returns 400 when Supabase is not configured', async () => {
      vi.stubEnv('SUPABASE_URL', '');
      vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '');
      const { POST } = await import('@/app/api/v1/debug/supabase-ping/route');
      const res = await POST();
      expect(res.status).toBe(400);
      const j = (await res.json()) as { configured: boolean };
      expect(j.configured).toBe(false);
    });
  });

  describe('POST /api/v1/debug/brain-ping', () => {
    it('returns a reply from mock brain', async () => {
      vi.stubEnv('BRAIN_PROVIDER', 'mock');
      const { POST } = await import('@/app/api/v1/debug/brain-ping/route');
      const req = new NextRequest('http://localhost/api', {
        method: 'POST',
        body: JSON.stringify({ message: 'Hello brain test' }),
      });
      const res = await POST(req);
      expect(res.status).toBe(200);
      const j = (await res.json()) as { ok: boolean; reply: { text: string } };
      expect(j.ok).toBe(true);
      expect(j.reply.text.length).toBeGreaterThan(0);
    });
  });

  describe('POST /api/v1/debug/call-store-ping', () => {
    it('creates a session and returns transcript count', async () => {
      const { POST } = await import('@/app/api/v1/debug/call-store-ping/route');
      const res = await POST();
      expect(res.status).toBe(200);
      const j = (await res.json()) as { ok: boolean; transcriptTurns: number; sessionId: string };
      expect(j.ok).toBe(true);
      expect(j.transcriptTurns).toBe(0);
      expect(j.sessionId).toMatch(/^debug-store-/);
    });
  });

  describe('POST /api/v1/debug/twilio-ping', () => {
    const origFetch = global.fetch;

    afterEach(() => {
      global.fetch = origFetch;
    });

    it('returns 200 when Twilio account fetch succeeds', async () => {
      vi.stubEnv('TWILIO_ACCOUNT_SID', 'test-twilio-account-sid');
      vi.stubEnv('TWILIO_API_KEY', 'test-twilio-api-key');
      vi.stubEnv('TWILIO_API_SECRET', 'test-twilio-api-secret');
      resetAll();

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ status: 'active', friendly_name: 'Demo' }),
      });

      const { POST } = await import('@/app/api/v1/debug/twilio-ping/route');
      const res = await POST();
      expect(res.status).toBe(200);
      const j = (await res.json()) as { ok: boolean; accountStatus: string };
      expect(j.ok).toBe(true);
      expect(j.accountStatus).toBe('active');
    });
  });
});

describe('call session read API routes', () => {
  beforeEach(() => {
    resetAll();
    vi.unstubAllEnvs();
  });

  it('GET /api/v1/calls/[id] returns persisted session', async () => {
    const id = generateId();
    const { getProviders } = await import('@/lib/container');
    await (await getProviders()).callStore.createSession({ id, toNumber: '+15551234567' });

    const { GET } = await import('@/app/api/v1/calls/[id]/route');
    const res = await GET(new NextRequest('http://localhost'), { params: { id } });
    expect(res.status).toBe(200);
    const j = (await res.json()) as { session: { id: string; toNumber: string } };
    expect(j.session.id).toBe(id);
    expect(j.session.toNumber).toBe('+15551234567');
  });

  it('GET /api/v1/calls/[id] returns 404 when session is missing', async () => {
    const { GET } = await import('@/app/api/v1/calls/[id]/route');
    const res = await GET(new NextRequest('http://localhost'), {
      params: { id: '00000000-0000-4000-8000-000000000000' },
    });
    expect(res.status).toBe(404);
  });

  it('GET /api/v1/calls/[id]/transcript returns turns', async () => {
    const id = generateId();
    const { getProviders } = await import('@/lib/container');
    const store = (await getProviders()).callStore;
    await store.createSession({ id, toNumber: '+15551234567' });
    await store.appendTurn({ callSessionId: id, speaker: 'human', text: 'Hi' });

    const { GET } = await import('@/app/api/v1/calls/[id]/transcript/route');
    const res = await GET(new NextRequest('http://localhost'), { params: { id } });
    expect(res.status).toBe(200);
    const j = (await res.json()) as { turns: Array<{ text: string }> };
    expect(j.turns).toHaveLength(1);
    expect(j.turns[0].text).toBe('Hi');
  });
});
