import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { createProvidersFromInstances, resetProviders } from '@/core/modules/provider-registry';
import { resetContainer } from '@/lib/container';
import { generateId } from '@/lib/id';
import { InMemoryCallStoreAdapter } from '@/adapters/in-memory-call-store.adapter';
import { MockBrainAdapter } from '@/adapters/mock-brain.adapter';
import type { TelephonyPort, PlaceCallResult, VoiceAction } from '@/core/ports/telephony.port';
import type { NormalizedProviderEvent } from '@/core/domain/events';
import type { TTSPort } from '@/core/ports/tts.port';

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

describe('tts API routes', () => {
  beforeEach(() => {
    resetAll();
    vi.unstubAllEnvs();
  });

  class StubTelephony implements TelephonyPort {
    async placeCall(): Promise<PlaceCallResult> {
      return { providerCallId: 'stub' };
    }
    async hangupCall(): Promise<void> {}
    normalizeProviderEvent(): NormalizedProviderEvent {
      return { type: 'failed', providerCallId: '', timestamp: new Date() };
    }
    respondWithVoiceActions(_actions: VoiceAction[]): string {
      return '<Response/>';
    }
    validateWebhookSignature(): boolean {
      return true;
    }
  }

  it('GET /api/v1/tts returns 400 when TTS not configured', async () => {
    createProvidersFromInstances({
      telephony: new StubTelephony(),
      brain: new MockBrainAdapter(),
      callStore: new InMemoryCallStoreAdapter(),
    });

    const { GET } = await import('@/app/api/v1/tts/route');
    const res = await GET(new NextRequest('http://localhost/api/v1/tts?text=Hello'));
    expect(res.status).toBe(400);
  });

  it('GET /api/v1/tts returns audio bytes when configured', async () => {
    const tts: TTSPort = {
      synthesize: async () => ({
        contentType: 'audio/mpeg',
        audio: new Uint8Array([1, 2, 3, 4]),
      }),
    };

    createProvidersFromInstances({
      telephony: new StubTelephony(),
      brain: new MockBrainAdapter(),
      callStore: new InMemoryCallStoreAdapter(),
      tts,
    });

    const { GET } = await import('@/app/api/v1/tts/route');
    const res = await GET(new NextRequest('http://localhost/api/v1/tts?text=Hello&format=mp3'));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('audio/mpeg');
    const buf = new Uint8Array(await res.arrayBuffer());
    expect(buf.length).toBe(4);
    expect(Array.from(buf)).toEqual([1, 2, 3, 4]);
  });

  it('GET /api/v1/tts returns audio when token is valid (no plain text required)', async () => {
    vi.stubEnv('TTS_TOKEN_SECRET', 'secret');

    const tts: TTSPort = {
      synthesize: async (text) => ({
        contentType: 'audio/mpeg',
        audio: new TextEncoder().encode(text),
      }),
    };

    createProvidersFromInstances({
      telephony: new StubTelephony(),
      brain: new MockBrainAdapter(),
      callStore: new InMemoryCallStoreAdapter(),
      tts,
    });

    const payload = Buffer.from(
      JSON.stringify({
        v: 1,
        exp: Math.floor(Date.now() / 1000) + 30,
        callSessionId: 'sess-1',
        text: 'Token hello',
        format: 'mp3',
        voice: null,
      }),
      'utf8',
    ).toString('base64url');
    const { createHmac } = await import('crypto');
    const sig = createHmac('sha256', 'secret').update(payload, 'utf8').digest('base64url');
    const token = `${payload}.${sig}`;

    const { GET } = await import('@/app/api/v1/tts/route');
    const res = await GET(new NextRequest(`http://localhost/api/v1/tts?token=${encodeURIComponent(token)}`));
    expect(res.status).toBe(200);
    const buf = new Uint8Array(await res.arrayBuffer());
    expect(new TextDecoder().decode(buf)).toBe('Token hello');
  });
});

describe('browser call API routes', () => {
  beforeEach(() => {
    resetAll();
    vi.unstubAllEnvs();
  });

  it('POST /api/v1/browser/start returns 400 when TTS not configured', async () => {
    const { POST } = await import('@/app/api/v1/browser/start/route');
    const res = await POST();
    expect(res.status).toBe(400);
  });
});

describe('telephony events webhook (signature)', () => {
  beforeEach(() => {
    resetAll();
    vi.unstubAllEnvs();
    vi.stubEnv('NODE_ENV', 'production');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns 403 when signature is present but invalid', async () => {
    createProvidersFromInstances({
      telephony: {
        async placeCall() {
          return { providerCallId: 'stub' };
        },
        async hangupCall() {},
        normalizeProviderEvent() {
          return { type: 'completed', providerCallId: 'CA1', timestamp: new Date() };
        },
        respondWithVoiceActions() {
          return '<Response/>';
        },
        validateWebhookSignature() {
          return false;
        },
      },
      brain: new MockBrainAdapter(),
      callStore: new InMemoryCallStoreAdapter(),
    });

    const { POST } = await import('@/app/api/v1/telephony/events/route');
    const body = new URLSearchParams({ CallSid: 'CA1', CallStatus: 'completed' }).toString();
    const req = new NextRequest('http://localhost/api/v1/telephony/events?callSessionId=sess-1', {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        'x-twilio-signature': 'sig',
      },
      body,
    });
    const res = await POST(req);
    expect(res.status).toBe(403);
  });

  it('returns 403 when signature header is missing in production', async () => {
    const store = new InMemoryCallStoreAdapter();
    createProvidersFromInstances({
      telephony: {
        async placeCall() {
          return { providerCallId: 'stub' };
        },
        async hangupCall() {},
        normalizeProviderEvent() {
          return { type: 'completed', providerCallId: 'CA1', timestamp: new Date() };
        },
        respondWithVoiceActions() {
          return '<Response/>';
        },
        validateWebhookSignature() {
          return false;
        },
      },
      brain: new MockBrainAdapter(),
      callStore: store,
    });

    // Ensure the call session exists so the real controller can process the event.
    await store.createSession({ id: 'sess-2', toNumber: '+15551234567' });

    const { POST } = await import('@/app/api/v1/telephony/events/route');
    const body = new URLSearchParams({ CallSid: 'CA1', CallStatus: 'completed' }).toString();
    const req = new NextRequest('http://localhost/api/v1/telephony/events?callSessionId=sess-2', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
    });
    const res = await POST(req);
    expect(res.status).toBe(403);
  });
});
