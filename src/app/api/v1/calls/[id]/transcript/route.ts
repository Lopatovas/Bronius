import { NextRequest, NextResponse } from 'next/server';
import { getProviders } from '@/lib/container';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const providers = await getProviders();
    const turns = await providers.callStore.getTranscript(params.id);

    return NextResponse.json({ turns });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
