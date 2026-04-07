import { describe, it, expect } from 'vitest';
import { TwilioTelephonyAdapter } from '@/adapters/twilio-telephony.adapter';

describe('Webhook Normalization', () => {
  const adapter = new TwilioTelephonyAdapter('AC_test', 'SK_test', 'secret_test');

  it('should normalize initiated status (Twilio progress callback)', () => {
    const event = adapter.normalizeProviderEvent({
      CallStatus: 'initiated',
      CallSid: 'CA_init',
    });
    expect(event.type).toBe('initiated');
    expect(event.providerCallId).toBe('CA_init');
  });

  it('should normalize queued status', () => {
    const event = adapter.normalizeProviderEvent({
      CallStatus: 'queued',
      CallSid: 'CA_q',
    });
    expect(event.type).toBe('queued');
  });

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

  it('should throw clear error when credentials are empty', async () => {
    const noCredAdapter = new TwilioTelephonyAdapter('', '', '');
    await expect(
      noCredAdapter.placeCall({
        toNumber: '+14155552671',
        fromNumber: '+15551234567',
        callSessionId: 'test-123',
        webhookBaseUrl: 'https://example.com',
      }),
    ).rejects.toThrow('TWILIO_ACCOUNT_SID');
  });

  it('should throw clear error when fromNumber is empty', async () => {
    await expect(
      adapter.placeCall({
        toNumber: '+14155552671',
        fromNumber: '',
        callSessionId: 'test-123',
        webhookBaseUrl: 'https://example.com',
      }),
    ).rejects.toThrow('TWILIO_PHONE_NUMBER');
  });

  it('should throw clear error when webhookBaseUrl is empty', async () => {
    await expect(
      adapter.placeCall({
        toNumber: '+14155552671',
        fromNumber: '+15551234567',
        callSessionId: 'test-123',
        webhookBaseUrl: '',
      }),
    ).rejects.toThrow('Webhook base URL');
  });
});

describe('TwiML Generation', () => {
  const adapter = new TwilioTelephonyAdapter('AC_test', 'SK_test', 'secret_test');

  it('should generate valid TwiML for Say action', () => {
    const twiml = adapter.respondWithVoiceActions([
      { type: 'say', text: 'Hello there!' },
    ]);
    expect(twiml).toContain('<Response>');
    expect(twiml).toContain('</Response>');
    expect(twiml).toContain('<Say');
    expect(twiml).toContain('Hello there!');
    expect(twiml).toContain('Polly.Amy');
  });

  it('should generate Play TwiML for Say action when TTS is enabled', () => {
    const twiml = adapter.respondWithVoiceActions(
      [{ type: 'say', text: 'Hello there!' }],
      { webhookBaseUrl: 'https://example.com', useTts: true, ttsFormat: 'mp3' },
    );
    expect(twiml).toContain('<Play>');
    expect(twiml).toContain('https://example.com/api/v1/tts?text=');
    expect(twiml).toContain('&amp;format=mp3');
    expect(twiml).not.toContain('<Say');
  });

  it('should generate valid TwiML for Gather action', () => {
    const twiml = adapter.respondWithVoiceActions([
      {
        type: 'gather',
        gatherOptions: {
          input: 'speech',
          speechTimeout: 'auto',
          timeout: 5,
          actionPath: '/api/v1/telephony/gather?callSessionId=123',
        },
      },
    ]);
    expect(twiml).toContain('<Gather');
    expect(twiml).toContain('input="speech"');
    expect(twiml).toContain('speechTimeout="auto"');
    expect(twiml).toContain('<Gather');
  });

  it('should generate Hangup TwiML', () => {
    const twiml = adapter.respondWithVoiceActions([{ type: 'hangup' }]);
    expect(twiml).toContain('<Hangup/>');
  });

  it('should generate Pause TwiML', () => {
    const twiml = adapter.respondWithVoiceActions([{ type: 'pause', length: 3 }]);
    expect(twiml).toContain('<Pause length="3"/>');
  });

  it('should escape XML special characters in text', () => {
    const twiml = adapter.respondWithVoiceActions([
      { type: 'say', text: 'Tom & Jerry <friends>' },
    ]);
    expect(twiml).toContain('Tom &amp; Jerry &lt;friends&gt;');
    expect(twiml).not.toContain('Tom & Jerry <friends>');
  });

  it('should combine multiple actions in one Response', () => {
    const twiml = adapter.respondWithVoiceActions([
      { type: 'say', text: 'Hello' },
      { type: 'pause', length: 1 },
      { type: 'say', text: 'Goodbye' },
      { type: 'hangup' },
    ]);
    expect(twiml).toContain('<Say');
    expect(twiml).toContain('<Pause');
    expect(twiml).toContain('<Hangup/>');
    expect(twiml.indexOf('Hello')).toBeLessThan(twiml.indexOf('Goodbye'));
  });
});

describe('Webhook Signature Validation', () => {
  it('should validate correct HMAC-SHA1 signature', async () => {
    const { createHmac } = await import('crypto');
    const secret = 'test_secret_123';
    const adapter = new TwilioTelephonyAdapter('AC_test', 'SK_test', 'api_secret_unused', secret);

    const url = 'https://example.com/api/v1/telephony/events';
    const params = { CallSid: 'CA123', CallStatus: 'ringing' };

    const data = url + 'CallSid' + 'CA123' + 'CallStatus' + 'ringing';
    const expected = createHmac('sha1', secret).update(data, 'utf-8').digest('base64');

    expect(adapter.validateWebhookSignature(expected, url, params)).toBe(true);
  });

  it('should reject incorrect signature', () => {
    const adapter = new TwilioTelephonyAdapter('AC_test', 'SK_test', 'secret');
    expect(adapter.validateWebhookSignature('bad_sig', 'https://x.com', { a: '1' })).toBe(false);
  });

  it('should reject when secret is empty', () => {
    const adapter = new TwilioTelephonyAdapter('AC_test', 'SK_test', '');
    expect(adapter.validateWebhookSignature('sig', 'https://x.com', {})).toBe(false);
  });
});
