import { NextResponse } from 'next/server';
import { getProviders } from '@/lib/container';
import { generateId } from '@/lib/id';
import { pushIntegrationTrace } from '@/lib/integration-trace';

export async function POST() {
  try {
    const store = (await getProviders()).callStore;
    const id = `debug-store-${generateId()}`;

    pushIntegrationTrace({
      kind: 'debug_tool',
      label: 'Debug: call store round-trip start',
      callSessionId: id,
      meta: {},
    });

    await store.createSession({ id, toNumber: '+15550001234' });
    const session = await store.getSession(id);
    const transcript = await store.getTranscript(id);

    pushIntegrationTrace({
      kind: 'debug_tool',
      label: 'Debug: call store round-trip done',
      callSessionId: id,
      meta: {
        sessionFound: Boolean(session),
        status: session?.status,
        transcriptTurns: transcript.length,
      },
    });

    return NextResponse.json({
      ok: true,
      sessionId: id,
      session,
      transcriptTurns: transcript.length,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    pushIntegrationTrace({
      kind: 'debug_tool',
      label: 'Debug: call store ping error',
      meta: { error: message },
    });
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
