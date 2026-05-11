import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCallController, getProviders } from '@/lib/container';

const bodySchema = z.object({
  callSessionId: z.string().uuid(),
});

export async function POST(req: NextRequest) {
  const json = await req.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid body', details: parsed.error.flatten() }, { status: 400 });
  }

  const { callSessionId } = parsed.data;

  try {
    const providers = await getProviders();
    const session = await providers.callStore.getSession(callSessionId);
    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    const controller = await getCallController();
    await controller.transitionStatus(callSessionId, 'HANGUP');
    await controller.transitionStatus(callSessionId, 'COMPLETED', {
      endedAt: new Date(),
    });

    const refreshed = await providers.callStore.getSession(callSessionId);
    return NextResponse.json({ ok: true, session: refreshed });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

