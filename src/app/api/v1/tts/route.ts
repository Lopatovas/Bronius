import { NextRequest, NextResponse } from 'next/server';
import { getProviders } from '@/lib/container';
import { log } from '@/lib/logger';
import type { TTSFormat } from '@/core/ports/tts.port';
import { createHmac, timingSafeEqual } from 'crypto';

const MAX_TEXT_CHARS = 600;
const MAX_TOKEN_AGE_SEC = 60;

function normalizeFormat(raw: string | null): TTSFormat {
  const v = (raw || 'mp3').toLowerCase();
  if (v === 'mp3' || v === 'wav' || v === 'opus' || v === 'pcm' || v === 'flac') return v;
  return 'mp3';
}

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token');

  let text = '';
  let voiceId: string | undefined;
  let format: TTSFormat = 'mp3';

  if (token) {
    const [payloadB64, sigB64] = token.split('.', 2);
    if (!payloadB64 || !sigB64) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 400 });
    }
    const secret = process.env.TTS_TOKEN_SECRET || process.env.TWILIO_AUTH_TOKEN || '';
    if (!secret) {
      return NextResponse.json({ error: 'TTS token secret not configured' }, { status: 500 });
    }
    const expected = createHmac('sha256', secret).update(payloadB64, 'utf8').digest('base64url');
    const a = Buffer.from(expected, 'utf8');
    const b = Buffer.from(sigB64, 'utf8');
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      return NextResponse.json({ error: 'Invalid token signature' }, { status: 403 });
    }

    const payloadJson = Buffer.from(payloadB64, 'base64url').toString('utf8');
    const payload = JSON.parse(payloadJson) as {
      v: number;
      exp: number;
      callSessionId: string;
      text: string;
      format?: string;
      voice?: string | null;
    };
    const now = Math.floor(Date.now() / 1000);
    if (!payload?.exp || payload.exp < now || payload.exp > now + MAX_TOKEN_AGE_SEC) {
      return NextResponse.json({ error: 'Token expired' }, { status: 403 });
    }
    text = (payload.text || '').trim();
    voiceId = payload.voice || undefined;
    format = normalizeFormat(payload.format || 'mp3');
  } else {
    // Dashboard/manual usage: only allow when the request is authenticated by APP_PASSWORD middleware.
    text = (req.nextUrl.searchParams.get('text') || '').trim();
    voiceId = req.nextUrl.searchParams.get('voice') || undefined;
    format = normalizeFormat(req.nextUrl.searchParams.get('format'));
  }

  if (!text) return NextResponse.json({ error: 'Missing text' }, { status: 400 });
  if (text.length > MAX_TEXT_CHARS) {
    return NextResponse.json({ error: `Text too long (max ${MAX_TEXT_CHARS} chars)` }, { status: 400 });
  }

  try {
    const providers = await getProviders();
    if (!providers.tts) {
      return NextResponse.json({ error: 'TTS not configured' }, { status: 400 });
    }

    const result = await providers.tts.synthesize(text, { format, voiceId });
    // NextResponse typing can be overly strict across runtimes; Buffer is accepted at runtime.
    return new NextResponse(Buffer.from(result.audio) as any, {
      status: 200,
      headers: {
        'Content-Type': result.contentType,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    log.error({ err }, 'TTS synthesis failed');
    return NextResponse.json({ error: 'TTS synthesis failed' }, { status: 500 });
  }
}

