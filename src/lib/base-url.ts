import { NextRequest } from 'next/server';

export function resolveBaseUrl(req: NextRequest): string {
  const forwardedProto = req.headers.get('x-forwarded-proto');
  const forwardedHost = req.headers.get('x-forwarded-host');

  if (forwardedHost) {
    const proto = forwardedProto || 'https';
    return `${proto}://${forwardedHost}`;
  }

  const host = req.headers.get('host');
  if (host) {
    const proto = forwardedProto || (host.startsWith('localhost') ? 'http' : 'https');
    return `${proto}://${host}`;
  }

  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }

  return req.nextUrl.origin;
}
