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
    actionOnEmptyResult?: boolean;
  };
  length?: number;
}

export interface TelephonyPort {
  placeCall(params: PlaceCallParams): Promise<PlaceCallResult>;
  hangupCall(providerCallId: string): Promise<void>;
  normalizeProviderEvent(rawPayload: Record<string, string>): NormalizedProviderEvent;
  respondWithVoiceActions(
    actions: VoiceAction[],
    options?: {
      webhookBaseUrl?: string;
      useTts?: boolean;
      ttsFormat?: 'mp3' | 'wav' | 'opus' | 'pcm' | 'flac';
    },
  ): string;
  validateWebhookSignature(
    signature: string,
    url: string,
    params: Record<string, string>,
  ): boolean;
}
