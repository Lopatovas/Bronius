import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { middleware } from '@/middleware';

describe('middleware', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('blocks /api/v1/tts without auth cookie when APP_PASSWORD is set', async () => {
    vi.stubEnv('APP_PASSWORD', 'pw');
    const req = new NextRequest('https://example.com/api/v1/tts?text=Hello');
    const res = middleware(req);
    expect(res.status).toBe(401);
  });

  it('blocks other /api paths without cookie when APP_PASSWORD is set', async () => {
    vi.stubEnv('APP_PASSWORD', 'pw');
    const req = new NextRequest('https://example.com/api/v1/calls');
    const res = middleware(req);
    expect(res.status).toBe(401);
  });
});

