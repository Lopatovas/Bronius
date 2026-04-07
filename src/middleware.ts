import { NextRequest, NextResponse } from 'next/server';

const OPEN_PATHS = ['/api/v1/telephony/', '/api/v1/tts', '/login', '/api/auth/login'];

export function middleware(req: NextRequest) {
  const password = process.env.APP_PASSWORD;
  if (!password) return NextResponse.next();

  const path = req.nextUrl.pathname;
  if (OPEN_PATHS.some((p) => path.startsWith(p))) {
    return NextResponse.next();
  }

  const cookie = req.cookies.get('bronius_auth')?.value;
  if (cookie === password) {
    return NextResponse.next();
  }

  if (path === '/api/auth/login') {
    return NextResponse.next();
  }

  if (path.startsWith('/api/')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const loginUrl = req.nextUrl.clone();
  loginUrl.pathname = '/login';
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
