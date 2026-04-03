import twilio from 'twilio';
import { TelephonyPort, PlaceCallParams, PlaceCallResult, VoiceAction } from '../core/ports/telephony.port';
import { NormalizedProviderEvent } from '../core/domain/events';

const VoiceResponse = twilio.twiml.VoiceResponse;

export class TwilioTelephonyAdapter implements TelephonyPort {
  private client: twilio.Twilio;

  constructor(
    private accountSid: string,
    private authToken: string,
  ) {
    this.client = twilio(accountSid, authToken);
  }

  async placeCall(params: PlaceCallParams): Promise<PlaceCallResult> {
    const call = await this.client.calls.create({
      to: params.toNumber,
      from: params.fromNumber,
      url: `${params.webhookBaseUrl}/api/v1/telephony/voice?callSessionId=${params.callSessionId}`,
      statusCallback: `${params.webhookBaseUrl}/api/v1/telephony/events?callSessionId=${params.callSessionId}`,
      statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
      statusCallbackMethod: 'POST',
      method: 'POST',
    });

    return { providerCallId: call.sid };
  }

  async hangupCall(providerCallId: string): Promise<void> {
    await this.client.calls(providerCallId).update({ status: 'completed' });
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
