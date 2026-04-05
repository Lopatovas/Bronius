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
    log.error({}, 'Gather webhook called without callSessionId');
    return twimlResponse(FALLBACK);
  }

  try {
    const formData = await req.formData();

    const speechResult = formData.get('SpeechResult')?.toString();
    const confidenceStr = formData.get('Confidence')?.toString();
    const confidence = confidenceStr ? parseFloat(confidenceStr) : undefined;

    log.info(
      { callSessionId, speechResult: speechResult?.substring(0, 50), confidence },
      'Gather result received',
    );

    const controller = await getCallController();
    const providers = await getProviders();

    const actions = await controller.handleGatherResult(callSessionId, speechResult, confidence);
    const twiml = providers.telephony.respondWithVoiceActions(actions);

    return twimlResponse(twiml);
  } catch (err) {
    log.error({ callSessionId, err }, 'Error processing gather webhook');
    return twimlResponse(FALLBACK);
  }
}
