import { NextRequest, NextResponse } from 'next/server';
import { getCallController, getProviders } from '@/lib/container';
import { log } from '@/lib/logger';

export async function POST(req: NextRequest) {
  try {
    const callSessionId = req.nextUrl.searchParams.get('callSessionId');
    if (!callSessionId) {
      return NextResponse.json({ error: 'Missing callSessionId' }, { status: 400 });
    }

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

    return new NextResponse(twiml, {
      status: 200,
      headers: { 'Content-Type': 'text/xml' },
    });
  } catch (err) {
    log.error({ err }, 'Error processing gather webhook');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
