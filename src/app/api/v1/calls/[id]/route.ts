import { NextRequest, NextResponse } from 'next/server';
import { getProviders } from '@/lib/container';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const providers = await getProviders();
    const session = await providers.callStore.getSession(params.id);

    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    return NextResponse.json({ session });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
