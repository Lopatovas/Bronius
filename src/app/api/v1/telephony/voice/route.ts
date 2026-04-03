import { NextRequest, NextResponse } from 'next/server';
import { getCallController, getProviders } from '@/lib/container';
import { log } from '@/lib/logger';

export async function POST(req: NextRequest) {
  try {
    const callSessionId = req.nextUrl.searchParams.get('callSessionId');
    if (!callSessionId) {
      return NextResponse.json({ error: 'Missing callSessionId' }, { status: 400 });
    }

    log.info({ callSessionId }, 'Voice webhook called (call answered)');

    const controller = await getCallController();
    const providers = await getProviders();

    await controller.transitionStatus(callSessionId, 'GREETING');

    const actions = controller.generateGreeting(callSessionId);
    const twiml = providers.telephony.respondWithVoiceActions(actions);

    await providers.callStore.appendTurn({
      callSessionId,
      speaker: 'agent',
      text: 'Hello! This is Bronius calling. How can I help you today?',
    });

    return new NextResponse(twiml, {
      status: 200,
      headers: { 'Content-Type': 'text/xml' },
    });
  } catch (err) {
    log.error({ err }, 'Error processing voice webhook');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
