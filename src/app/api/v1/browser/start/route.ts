import { NextResponse } from 'next/server';
import { getCallController, getProviders } from '@/lib/container';
import { generateId } from '@/lib/id';

const GREETING_TEXT = 'Hello! This is Bronius calling. How can I help you today?';

export async function POST() {
  try {
    const callSessionId = generateId();
    const controller = await getCallController();
    const providers = await getProviders();

    if (!providers.tts) {
      return NextResponse.json({ error: 'TTS not configured' }, { status: 400 });
    }

    await providers.callStore.createSession({ id: callSessionId, toNumber: 'browser' });
    await controller.transitionStatus(callSessionId, 'CONNECTED', { startedAt: new Date() });
    await controller.transitionStatus(callSessionId, 'GREETING');
    await providers.callStore.appendTurn({ callSessionId, speaker: 'agent', text: GREETING_TEXT });

    const audio = await providers.tts.synthesize(GREETING_TEXT, { format: 'mp3' });

    return NextResponse.json({
      callSessionId,
      replyText: GREETING_TEXT,
      audioContentType: audio.contentType,
      audioBase64: Buffer.from(audio.audio).toString('base64'),
      status: 'GREETING',
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

