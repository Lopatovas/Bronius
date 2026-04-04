import { NextRequest, NextResponse } from 'next/server';
import { getIntegrationTrace } from '@/lib/integration-trace';

export async function GET(req: NextRequest) {
  const sinceId = req.nextUrl.searchParams.get('sinceId') || undefined;
  const limitRaw = req.nextUrl.searchParams.get('limit');
  const limit = limitRaw ? Math.min(400, Math.max(1, parseInt(limitRaw, 10) || 200)) : undefined;

  const { entries, resetSuggested } = getIntegrationTrace({ sinceId, limit });
  return NextResponse.json({ entries, resetSuggested });
}
