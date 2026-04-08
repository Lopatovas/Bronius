import { NextRequest, NextResponse } from 'next/server';
import { getCallController, getProviders } from '@/lib/container';
import { BrowserVoiceAdapter } from '@/adapters/browser-voice.adapter';

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get('audio');
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Missing audio file' }, { status: 400 });
    }

    const callSessionId = form.get('callSessionId')?.toString() || undefined;
    const mimeType = file.type || 'audio/webm';
    const buf = new Uint8Array(await file.arrayBuffer());

    const providers = await getProviders();
    if (!providers.stt) {
      return NextResponse.json({ error: 'STT not configured' }, { status: 400 });
    }
    if (!providers.tts) {
      return NextResponse.json({ error: 'TTS not configured' }, { status: 400 });
    }

    const stt = await providers.stt.transcribe({ audio: buf, mimeType, language: 'en' });

    const controller = await getCallController();
    const adapter = new BrowserVoiceAdapter(controller, providers);

    const result = await adapter.handleTextTurn({
      callSessionId,
      text: stt.text,
    });

    return NextResponse.json({
      ...result,
      sttText: stt.text,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

