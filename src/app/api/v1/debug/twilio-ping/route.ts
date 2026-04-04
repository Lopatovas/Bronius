import { NextResponse } from 'next/server';
import { getProviders } from '@/lib/container';
import { TwilioTelephonyAdapter } from '@/adapters/twilio-telephony.adapter';
import { pushIntegrationTrace } from '@/lib/integration-trace';

export async function POST() {
  try {
    const telephony = (await getProviders()).telephony;

    if (!(telephony instanceof TwilioTelephonyAdapter)) {
      return NextResponse.json(
        { ok: false, error: 'Twilio adapter is not active (unexpected provider).' },
        { status: 400 },
      );
    }

    pushIntegrationTrace({
      kind: 'debug_tool',
      label: 'Debug: Twilio REST credential check',
      meta: {},
    });

    const result = await telephony.verifyRestCredentials();

    if (!result.ok) {
      return NextResponse.json(
        { ok: false, error: result.error, httpStatus: result.httpStatus },
        { status: 502 },
      );
    }

    return NextResponse.json({
      ok: true,
      accountStatus: result.accountStatus,
      friendlyName: result.friendlyName,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    pushIntegrationTrace({
      kind: 'debug_tool',
      label: 'Debug: Twilio ping error',
      meta: { error: message },
    });
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
