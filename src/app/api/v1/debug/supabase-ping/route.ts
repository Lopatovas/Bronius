import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { loadConfigFromEnv } from '@/core/modules/provider-registry';

export async function POST() {
  const config = loadConfigFromEnv();

  if (!config.supabaseUrl || !config.supabaseServiceKey) {
    return NextResponse.json(
      {
        ok: false,
        configured: false,
        error: 'Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to use Supabase.',
      },
      { status: 400 },
    );
  }

  try {
    const client = createClient(config.supabaseUrl, config.supabaseServiceKey);

    const { error, count } = await client
      .from('call_sessions')
      .select('*', { count: 'exact', head: true });

    if (error) {
      throw new Error(error.message);
    }

    return NextResponse.json({
      ok: true,
      configured: true,
      table: 'call_sessions',
      approxRowCount: count,
      supabaseHost: new URL(config.supabaseUrl).host,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ ok: false, configured: true, error: message }, { status: 502 });
  }
}
