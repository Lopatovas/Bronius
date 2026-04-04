import { NextRequest, NextResponse } from 'next/server';
import { startCallSchema } from '@/lib/validation';
import { generateId } from '@/lib/id';
import { getCallController } from '@/lib/container';
import { log } from '@/lib/logger';
import { resolveBaseUrl } from '@/lib/base-url';
import { pushIntegrationTrace } from '@/lib/integration-trace';

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

    pushIntegrationTrace({
      kind: 'api',
      label: 'App API → POST /api/v1/calls',
      callSessionId,
      meta: { toNumber: parsed.data.toNumber, webhookBaseUrl },
    });

    const session = await controller.initiateCall(callSessionId, parsed.data.toNumber, webhookBaseUrl);

    log.info({ callSessionId, webhookBaseUrl }, 'Call initiated via API');

    pushIntegrationTrace({
      kind: 'api',
      label: 'App API ← POST /api/v1/calls response',
      callSessionId,
      meta: {
        sessionId: session.id,
        status: session.status,
        providerCallId: session.providerCallId,
      },
    });

    return NextResponse.json({ callSessionId: session.id, session }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    log.error({ err }, 'Failed to initiate call');
    pushIntegrationTrace({
      kind: 'api',
      label: 'App API ← POST /api/v1/calls error',
      meta: { error: message },
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
