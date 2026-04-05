import { NextResponse } from 'next/server';
import { getProviders } from '@/lib/container';
import { TwilioTelephonyAdapter } from '@/adapters/twilio-telephony.adapter';

export async function POST() {
  try {
    const telephony = (await getProviders()).telephony;

    if (!(telephony instanceof TwilioTelephonyAdapter)) {
      return NextResponse.json(
        { ok: false, error: 'Twilio adapter is not active (unexpected provider).' },
        { status: 400 },
      );
    }

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
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
