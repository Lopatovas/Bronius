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

    const session = await providers.callStore.getSession(callSessionId);
    if (!session) {
      log.error({ callSessionId }, 'Session not found in voice webhook');
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    if (session.status === 'DIALING' || session.status === 'RINGING') {
      await controller.transitionStatus(callSessionId, 'CONNECTED', {
        startedAt: new Date(),
      });
    }
    if (session.status !== 'GREETING') {
      await controller.transitionStatus(callSessionId, 'GREETING');
    }

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
    const fallbackTwiml = '<?xml version="1.0" encoding="UTF-8"?><Response><Say>An error occurred. Goodbye.</Say><Hangup/></Response>';
    return new NextResponse(fallbackTwiml, {
      status: 200,
      headers: { 'Content-Type': 'text/xml' },
    });
  }
}
