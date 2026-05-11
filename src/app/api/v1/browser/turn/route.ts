import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCallController, getProviders } from '@/lib/container';
import { BrowserVoiceAdapter } from '@/adapters/browser-voice.adapter';

const bodySchema = z.object({
  callSessionId: z.string().optional(),
  text: z.string().max(2000),
  // Placeholder for future STT transport.
  audioBase64: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const json = await req.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid body', details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const controller = await getCallController();
    const providers = await getProviders();
    const adapter = new BrowserVoiceAdapter(controller, providers);

    if (!parsed.data.callSessionId) {
      return NextResponse.json({ error: 'Missing callSessionId (start a browser call first)' }, { status: 400 });
    }

    const result = await adapter.handleTextTurn(parsed.data);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

