import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const { password } = await req.json();
  const expected = process.env.APP_PASSWORD;

  if (!expected || password !== expected) {
    return NextResponse.json({ error: 'Wrong password' }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set('bronius_auth', password, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
  });
  return res;
}
