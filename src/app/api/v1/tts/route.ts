import { NextRequest, NextResponse } from 'next/server';
import { getProviders } from '@/lib/container';
import { log } from '@/lib/logger';
import type { TTSFormat } from '@/core/ports/tts.port';

const MAX_TEXT_CHARS = 600;

function normalizeFormat(raw: string | null): TTSFormat {
  const v = (raw || 'mp3').toLowerCase();
  if (v === 'mp3' || v === 'wav' || v === 'opus' || v === 'pcm' || v === 'flac') return v;
  return 'mp3';
}

export async function GET(req: NextRequest) {
  const text = req.nextUrl.searchParams.get('text') || '';
  const voiceId = req.nextUrl.searchParams.get('voice') || undefined;
  const format = normalizeFormat(req.nextUrl.searchParams.get('format'));

  const trimmed = text.trim();
  if (!trimmed) {
    return NextResponse.json({ error: 'Missing text' }, { status: 400 });
  }
  if (trimmed.length > MAX_TEXT_CHARS) {
    return NextResponse.json(
      { error: `Text too long (max ${MAX_TEXT_CHARS} chars)` },
      { status: 400 },
    );
  }

  try {
    const providers = await getProviders();
    if (!providers.tts) {
      return NextResponse.json({ error: 'TTS not configured' }, { status: 400 });
    }

    const result = await providers.tts.synthesize(trimmed, { format, voiceId });
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

