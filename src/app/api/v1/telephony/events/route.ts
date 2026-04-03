import { NextRequest, NextResponse } from 'next/server';
import { getCallController, getProviders } from '@/lib/container';
import { log } from '@/lib/logger';

const processedEvents = new Set<string>();

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const rawPayload: Record<string, string> = {};
    formData.forEach((value, key) => {
      rawPayload[key] = value.toString();
    });

    const callSessionId = req.nextUrl.searchParams.get('callSessionId');
    if (!callSessionId) {
      return NextResponse.json({ error: 'Missing callSessionId' }, { status: 400 });
    }

    const eventKey = `${callSessionId}:${rawPayload.CallStatus}:${rawPayload.CallSid}`;
    if (processedEvents.has(eventKey)) {
      log.info({ callSessionId }, 'Duplicate event skipped');
      return new NextResponse('OK', { status: 200 });
    }
    processedEvents.add(eventKey);

    if (processedEvents.size > 10000) {
      const entries = Array.from(processedEvents);
      entries.slice(0, 5000).forEach((e) => processedEvents.delete(e));
    }

    const providers = await getProviders();
    const signature = req.headers.get('x-twilio-signature') || '';
    const requestUrl = `${req.nextUrl.origin}${req.nextUrl.pathname}${req.nextUrl.search}`;

    if (process.env.NODE_ENV === 'production' && signature) {
      const valid = providers.telephony.validateWebhookSignature(signature, requestUrl, rawPayload);
      if (!valid) {
        log.warn({ callSessionId }, 'Invalid Twilio signature');
        return NextResponse.json({ error: 'Invalid signature' }, { status: 403 });
      }
    }

    const controller = await getCallController();
    const event = providers.telephony.normalizeProviderEvent(rawPayload);

    await controller.handleProviderEvent(event, callSessionId);

    return new NextResponse('OK', { status: 200 });
  } catch (err) {
    log.error({ err }, 'Error processing telephony event');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
