import { TelephonyPort } from '../ports/telephony.port';
import { BrainPort } from '../ports/brain.port';
import { CallStorePort } from '../ports/call-store.port';
import { STTPort } from '../ports/stt.port';
import { TTSPort } from '../ports/tts.port';

export interface ProviderConfig {
  brainProvider: 'openai' | 'mistral' | 'mock';
  twilioAccountSid?: string;
  twilioApiKey?: string;
  twilioApiSecret?: string;
  twilioAuthToken?: string;
  twilioPhoneNumber?: string;
  openaiApiKey?: string;
  mistralApiKey?: string;
  mistralModel?: string;
  mistralSttModel?: string;
  mistralTtsModel?: string;
  mistralTtsVoiceId?: string;
  supabaseUrl?: string;
  supabaseServiceKey?: string;
  maxTurns: number;
  maxCallDurationSec: number;
  maxSilenceRetries: number;
}

export interface RegisteredProviders {
  telephony: TelephonyPort;
  brain: BrainPort;
  callStore: CallStorePort;
  stt?: STTPort;
  tts?: TTSPort;
}

let cachedProviders: RegisteredProviders | null = null;

export function loadConfigFromEnv(): ProviderConfig {
  return {
    brainProvider: (process.env.BRAIN_PROVIDER as ProviderConfig['brainProvider']) || 'mock',
    twilioAccountSid: process.env.TWILIO_ACCOUNT_SID,
    twilioApiKey: process.env.TWILIO_API_KEY,
    twilioApiSecret: process.env.TWILIO_API_SECRET,
    twilioAuthToken: process.env.TWILIO_AUTH_TOKEN,
    twilioPhoneNumber: process.env.TWILIO_PHONE_NUMBER,
    openaiApiKey: process.env.OPENAI_API_KEY,
    mistralApiKey: process.env.MISTRAL_API_KEY,
    mistralModel: process.env.MISTRAL_MODEL,
    mistralSttModel: process.env.MISTRAL_STT_MODEL,
    mistralTtsModel: process.env.MISTRAL_TTS_MODEL,
    mistralTtsVoiceId: process.env.MISTRAL_TTS_VOICE_ID,
    supabaseUrl: process.env.SUPABASE_URL,
    supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    maxTurns: parseInt(process.env.MAX_TURNS || '10', 10),
    maxCallDurationSec: parseInt(process.env.MAX_CALL_DURATION_SEC || '300', 10),
    maxSilenceRetries: parseInt(process.env.MAX_SILENCE_RETRIES || '2', 10),
  };
}

export async function createProviders(config: ProviderConfig): Promise<RegisteredProviders> {
  if (cachedProviders) return cachedProviders;

  const { TwilioTelephonyAdapter } = await import('../../adapters/twilio-telephony.adapter');
  const { InMemoryCallStoreAdapter } = await import('../../adapters/in-memory-call-store.adapter');

  let brain: BrainPort;
  if (config.brainProvider === 'openai' && config.openaiApiKey) {
    const { OpenAIBrainAdapter } = await import('../../adapters/openai-brain.adapter');
    brain = new OpenAIBrainAdapter(config.openaiApiKey);
  } else if (config.brainProvider === 'mistral' && config.mistralApiKey) {
    const { MistralBrainAdapter } = await import('../../adapters/mistral-brain.adapter');
    brain = new MistralBrainAdapter(
      config.mistralApiKey,
      config.mistralModel || 'mistral-small-latest',
    );
  } else {
    const { MockBrainAdapter } = await import('../../adapters/mock-brain.adapter');
    brain = new MockBrainAdapter();
  }

  let callStore: CallStorePort;
  if (config.supabaseUrl && config.supabaseServiceKey) {
    const { SupabaseCallStoreAdapter } = await import('../../adapters/supabase-call-store.adapter');
    callStore = new SupabaseCallStoreAdapter(config.supabaseUrl, config.supabaseServiceKey);
  } else {
    callStore = new InMemoryCallStoreAdapter();
  }

  const telephony = new TwilioTelephonyAdapter(
    config.twilioAccountSid || '',
    config.twilioApiKey || '',
    config.twilioApiSecret || '',
    config.twilioAuthToken,
  );

  let stt: STTPort | undefined;
  if (config.mistralApiKey) {
    const { MistralSTTAdapter } = await import('../../adapters/mistral-stt.adapter');
    stt = new MistralSTTAdapter(config.mistralApiKey, config.mistralSttModel || 'voxtral-mini-latest');
  }

  let tts: TTSPort | undefined;
  if (config.mistralApiKey && config.mistralTtsVoiceId) {
    const { MistralTTSAdapter } = await import('../../adapters/mistral-tts.adapter');
    tts = new MistralTTSAdapter(
      config.mistralApiKey,
      config.mistralTtsVoiceId,
      config.mistralTtsModel || 'voxtral-mini-tts-2603',
    );
  }

  cachedProviders = { telephony, brain, callStore, stt, tts };
  return cachedProviders;
}

export function resetProviders(): void {
  cachedProviders = null;
}

export function createProvidersFromInstances(providers: RegisteredProviders): RegisteredProviders {
  cachedProviders = providers;
  return providers;
}
