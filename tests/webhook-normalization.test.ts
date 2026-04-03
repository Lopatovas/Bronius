import { describe, it, expect } from 'vitest';
import { TwilioTelephonyAdapter } from '@/adapters/twilio-telephony.adapter';

describe('Webhook Normalization', () => {
  const adapter = new TwilioTelephonyAdapter('AC_test', 'test_token');

  it('should normalize ringing status', () => {
    const event = adapter.normalizeProviderEvent({
      CallStatus: 'ringing',
      CallSid: 'CA123',
    });
    expect(event.type).toBe('ringing');
    expect(event.providerCallId).toBe('CA123');
  });

  it('should normalize in-progress to answered', () => {
    const event = adapter.normalizeProviderEvent({
      CallStatus: 'in-progress',
      CallSid: 'CA456',
    });
    expect(event.type).toBe('answered');
  });

  it('should normalize completed status', () => {
    const event = adapter.normalizeProviderEvent({
      CallStatus: 'completed',
      CallSid: 'CA789',
    });
    expect(event.type).toBe('completed');
  });

  it('should normalize failed status', () => {
    const event = adapter.normalizeProviderEvent({
      CallStatus: 'failed',
      CallSid: 'CA000',
    });
    expect(event.type).toBe('failed');
  });

  it('should normalize no-answer status', () => {
    const event = adapter.normalizeProviderEvent({
      CallStatus: 'no-answer',
      CallSid: 'CA111',
    });
    expect(event.type).toBe('no-answer');
  });

  it('should normalize busy status', () => {
    const event = adapter.normalizeProviderEvent({
      CallStatus: 'busy',
      CallSid: 'CA222',
    });
    expect(event.type).toBe('busy');
  });

  it('should normalize canceled status', () => {
    const event = adapter.normalizeProviderEvent({
      CallStatus: 'canceled',
      CallSid: 'CA333',
    });
    expect(event.type).toBe('canceled');
  });

  it('should default unknown status to failed', () => {
    const event = adapter.normalizeProviderEvent({
      CallStatus: 'unknown-thing',
      CallSid: 'CA444',
    });
    expect(event.type).toBe('failed');
  });

  it('should include raw payload', () => {
    const event = adapter.normalizeProviderEvent({
      CallStatus: 'ringing',
      CallSid: 'CA555',
      AccountSid: 'AC_test',
      ExtraField: 'value',
    });
    expect(event.raw).toBeDefined();
    expect(event.raw!.ExtraField).toBe('value');
  });

  it('should handle missing fields gracefully', () => {
    const event = adapter.normalizeProviderEvent({});
    expect(event.type).toBe('failed');
    expect(event.providerCallId).toBe('');
  });
});
