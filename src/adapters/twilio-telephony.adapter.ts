import twilio from 'twilio';
import { TelephonyPort, PlaceCallParams, PlaceCallResult, VoiceAction } from '../core/ports/telephony.port';
import { NormalizedProviderEvent } from '../core/domain/events';

const VoiceResponse = twilio.twiml.VoiceResponse;

export class TwilioTelephonyAdapter implements TelephonyPort {
  private client: twilio.Twilio | null = null;

  constructor(
    private accountSid: string,
    private authToken: string,
  ) {}

  private getClient(): twilio.Twilio {
    if (!this.accountSid || !this.authToken) {
      throw new Error(
        'Twilio credentials not configured. Set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN environment variables.',
      );
    }
    if (!this.client) {
      this.client = twilio(this.accountSid, this.authToken);
    }
    return this.client;
  }

  async placeCall(params: PlaceCallParams): Promise<PlaceCallResult> {
    if (!params.fromNumber) {
      throw new Error(
        'Twilio phone number not configured. Set TWILIO_PHONE_NUMBER environment variable.',
      );
    }
    if (!params.webhookBaseUrl) {
      throw new Error(
        'Webhook base URL not configured. Set TWILIO_WEBHOOK_BASE_URL environment variable.',
      );
    }

    const client = this.getClient();

    try {
      const call = await client.calls.create({
        to: params.toNumber,
        from: params.fromNumber,
        url: `${params.webhookBaseUrl}/api/v1/telephony/voice?callSessionId=${params.callSessionId}`,
        statusCallback: `${params.webhookBaseUrl}/api/v1/telephony/events?callSessionId=${params.callSessionId}`,
        statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
        statusCallbackMethod: 'POST',
        method: 'POST',
      });

      return { providerCallId: call.sid };
    } catch (err: unknown) {
      const twilioErr = err as { message?: string; code?: number; status?: number; moreInfo?: string };
      throw new Error(
        `Twilio API error: ${twilioErr.message || 'Unknown error'}` +
        (twilioErr.code ? ` (code: ${twilioErr.code})` : '') +
        (twilioErr.status ? ` (status: ${twilioErr.status})` : '') +
        (twilioErr.moreInfo ? ` — see ${twilioErr.moreInfo}` : ''),
      );
    }
  }

  async hangupCall(providerCallId: string): Promise<void> {
    const client = this.getClient();
    await client.calls(providerCallId).update({ status: 'completed' });
  }

  normalizeProviderEvent(raw: Record<string, string>): NormalizedProviderEvent {
    const callStatus = (raw.CallStatus || '').toLowerCase();
    const providerCallId = raw.CallSid || '';

    const typeMap: Record<string, NormalizedProviderEvent['type']> = {
      ringing: 'ringing',
      'in-progress': 'answered',
      completed: 'completed',
      failed: 'failed',
      'no-answer': 'no-answer',
      busy: 'busy',
      canceled: 'canceled',
    };

    return {
      type: typeMap[callStatus] || 'failed',
      providerCallId,
      timestamp: new Date(),
      raw: raw as Record<string, unknown>,
    };
  }

  respondWithVoiceActions(actions: VoiceAction[]): string {
    const response = new VoiceResponse();

    for (const action of actions) {
      switch (action.type) {
        case 'say':
          response.say({ voice: (action.voice || 'Polly.Amy') as 'Polly.Amy' }, action.text || '');
          break;
        case 'gather': {
          if (action.gatherOptions) {
            const gather = response.gather({
              input: [action.gatherOptions.input] as unknown as ['speech'],
              speechTimeout: action.gatherOptions.speechTimeout || 'auto',
              timeout: action.gatherOptions.timeout || 5,
              action: action.gatherOptions.actionPath,
              method: 'POST',
            });
            gather.say({ voice: 'Polly.Amy' }, '');
          }
          break;
        }
        case 'hangup':
          response.hangup();
          break;
        case 'pause':
          response.pause({ length: action.length || 1 });
          break;
      }
    }

    return response.toString();
  }

  validateWebhookSignature(
    signature: string,
    url: string,
    params: Record<string, string>,
  ): boolean {
    return twilio.validateRequest(this.authToken, signature, url, params);
  }
}
