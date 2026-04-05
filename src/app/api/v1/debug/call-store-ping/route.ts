import { NextResponse } from 'next/server';
import { getProviders } from '@/lib/container';
import { generateId } from '@/lib/id';

export async function POST() {
  try {
    const store = (await getProviders()).callStore;
    const id = `debug-store-${generateId()}`;

    await store.createSession({ id, toNumber: '+15550001234' });
    const session = await store.getSession(id);
    const transcript = await store.getTranscript(id);

    return NextResponse.json({
      ok: true,
      sessionId: id,
      session,
      transcriptTurns: transcript.length,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
