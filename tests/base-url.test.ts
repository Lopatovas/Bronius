import { describe, it, expect, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { resolveBaseUrl } from '@/lib/base-url';

describe('resolveBaseUrl', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('prefers x-forwarded-host and x-forwarded-proto when behind a proxy', () => {
    const req = new NextRequest('http://127.0.0.1:3000/api/v1/calls', {
      headers: {
        'x-forwarded-host': 'myapp.ngrok.io',
        'x-forwarded-proto': 'https',
      },
    });
    expect(resolveBaseUrl(req)).toBe('https://myapp.ngrok.io');
  });

  it('defaults forwarded proto to https when x-forwarded-host is set but proto is missing', () => {
    const req = new NextRequest('http://internal:3000/', {
      headers: { 'x-forwarded-host': 'example.com' },
    });
    expect(resolveBaseUrl(req)).toBe('https://example.com');
  });

  it('uses http for localhost when no forwarded headers', () => {
    const req = new NextRequest('http://localhost:3000/', {
      headers: { host: 'localhost:3000' },
    });
    expect(resolveBaseUrl(req)).toBe('http://localhost:3000');
  });

  it('uses https for non-localhost host when x-forwarded-proto is absent', () => {
    const req = new NextRequest('https://api.example.com/', {
      headers: { host: 'api.example.com' },
    });
    expect(resolveBaseUrl(req)).toBe('https://api.example.com');
  });

  it('falls back to VERCEL_URL when forwarded host and host are absent', () => {
    vi.stubEnv('VERCEL_URL', 'bronius-abc.vercel.app');
    const req = {
      headers: {
        get: (name: string) => {
          if (name === 'x-forwarded-host' || name === 'host') return null;
          return null;
        },
      },
      nextUrl: { origin: 'http://internal' },
    } as unknown as NextRequest;
    expect(resolveBaseUrl(req)).toBe('https://bronius-abc.vercel.app');
  });
});
