import { NextRequest, NextResponse } from 'next/server';
import { startCallSchema } from '@/lib/validation';
import { generateId } from '@/lib/id';
import { getCallController, getProviders } from '@/lib/container';
import { log } from '@/lib/logger';
import { resolveBaseUrl } from '@/lib/base-url';

export async function GET(req: NextRequest) {
  try {
    const raw = req.nextUrl.searchParams.get('limit');
    const limit = Math.min(500, Math.max(1, raw ? parseInt(raw, 10) || 200 : 200));
    const providers = await getProviders();
    const sessions = await providers.callStore.listSessions(limit);
    return NextResponse.json({ sessions });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    log.error({ err }, 'Failed to list call sessions');
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = startCallSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const callSessionId = generateId();
    const webhookBaseUrl = resolveBaseUrl(req);
    const controller = await getCallController();

    const session = await controller.initiateCall(callSessionId, parsed.data.toNumber, webhookBaseUrl);

    log.info({ callSessionId, webhookBaseUrl }, 'Call initiated via API');

    return NextResponse.json({ callSessionId: session.id, session }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    log.error({ err }, 'Failed to initiate call');
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
