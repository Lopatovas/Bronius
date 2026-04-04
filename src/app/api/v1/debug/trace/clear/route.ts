import { NextResponse } from 'next/server';
import { clearIntegrationTrace } from '@/lib/integration-trace';

export async function POST() {
  clearIntegrationTrace();
  return NextResponse.json({ ok: true });
}
