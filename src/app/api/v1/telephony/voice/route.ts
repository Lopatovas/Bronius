import { NextRequest, NextResponse } from 'next/server';
import { getCallController, getProviders } from '@/lib/container';
import { log } from '@/lib/logger';

function twimlResponse(twiml: string): NextResponse {
  return new NextResponse(twiml, {
    status: 200,
    headers: { 'Content-Type': 'text/xml' },
  });
}

const FALLBACK = '<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="Polly.Amy">An error occurred. Goodbye.</Say><Hangup/></Response>';

export async function POST(req: NextRequest) {
  const callSessionId = req.nextUrl.searchParams.get('callSessionId');
  if (!callSessionId) {
    log.error({}, 'Voice webhook called without callSessionId');
    return twimlResponse(FALLBACK);
  }

  try {
    log.info({ callSessionId }, 'Voice webhook called (call answered)');

    const controller = await getCallController();
    const providers = await getProviders();

    const session = await providers.callStore.getSession(callSessionId);

    if (session) {
      if (session.status === 'DIALING' || session.status === 'RINGING' || session.status === 'INIT') {
        await controller.transitionStatus(callSessionId, 'CONNECTED', {
          startedAt: new Date(),
        });
      }
      const refreshed = await providers.callStore.getSession(callSessionId);
      if (refreshed && refreshed.status !== 'GREETING') {
        await controller.transitionStatus(callSessionId, 'GREETING');
      }

      await providers.callStore.appendTurn({
        callSessionId,
        speaker: 'agent',
        text: 'Hello! This is Bronius calling. How can I help you today?',
      });
    } else {
      log.warn({ callSessionId }, 'Session not found in voice webhook, proceeding with greeting anyway');
    }

    const actions = controller.generateGreeting(callSessionId);
    const twiml = providers.telephony.respondWithVoiceActions(actions, {
      webhookBaseUrl: req.nextUrl.origin,
      useTts: Boolean(providers.tts),
      ttsFormat: 'mp3',
    });

    return twimlResponse(twiml);
  } catch (err) {
    log.error({ callSessionId, err }, 'Error processing voice webhook');
    return twimlResponse(FALLBACK);
  }
}
