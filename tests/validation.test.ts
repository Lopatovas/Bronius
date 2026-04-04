import { describe, it, expect } from 'vitest';
import { e164Schema, startCallSchema } from '@/lib/validation';

describe('e164Schema', () => {
  it('accepts valid E.164 numbers', () => {
    expect(e164Schema.safeParse('+14155552671').success).toBe(true);
    expect(e164Schema.safeParse('+442071838750').success).toBe(true);
    expect(e164Schema.safeParse('+37060123456').success).toBe(true);
  });

  it('rejects numbers without a leading +', () => {
    expect(e164Schema.safeParse('14155552671').success).toBe(false);
    expect(e164Schema.safeParse('0014155552671').success).toBe(false);
  });

  it('rejects +0 (first digit after + must be 1–9)', () => {
    expect(e164Schema.safeParse('+01234').success).toBe(false);
  });

  it('rejects overly long subscriber part', () => {
    expect(e164Schema.safeParse('+123456789012345678').success).toBe(false);
  });

  it('rejects empty or whitespace-only strings', () => {
    expect(e164Schema.safeParse('').success).toBe(false);
    expect(e164Schema.safeParse('   ').success).toBe(false);
  });
});

describe('startCallSchema', () => {
  it('accepts a valid payload', () => {
    const r = startCallSchema.safeParse({ toNumber: '+14155552671' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.toNumber).toBe('+14155552671');
  });

  it('rejects invalid toNumber', () => {
    const r = startCallSchema.safeParse({ toNumber: '555-1212' });
    expect(r.success).toBe(false);
  });

  it('rejects missing toNumber', () => {
    const r = startCallSchema.safeParse({});
    expect(r.success).toBe(false);
  });
});
