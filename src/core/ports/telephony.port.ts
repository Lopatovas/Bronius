import { NormalizedProviderEvent } from '../domain/events';

export interface PlaceCallParams {
  toNumber: string;
  fromNumber: string;
  callSessionId: string;
  webhookBaseUrl: string;
}

export interface PlaceCallResult {
  providerCallId: string;
}

export interface VoiceAction {
  type: 'say' | 'gather' | 'hangup' | 'pause';
  text?: string;
  voice?: string;
  gatherOptions?: {
    input: 'speech' | 'dtmf' | 'speech dtmf';
    speechTimeout?: string;
    timeout?: number;
    actionPath: string;
  };
  length?: number;
}

export interface TelephonyPort {
  placeCall(params: PlaceCallParams): Promise<PlaceCallResult>;
  hangupCall(providerCallId: string): Promise<void>;
  normalizeProviderEvent(rawPayload: Record<string, string>): NormalizedProviderEvent;
  respondWithVoiceActions(actions: VoiceAction[]): string;
  validateWebhookSignature(
    signature: string,
    url: string,
    params: Record<string, string>,
  ): boolean;
}
