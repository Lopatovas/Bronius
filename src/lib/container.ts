import { CallController, CallControllerConfig } from '../core/modules/call-controller';
import { ConversationEngine } from '../core/modules/conversation-engine';
import { TranscriptService } from '../core/modules/transcript-service';
import { createProviders, loadConfigFromEnv, RegisteredProviders } from '../core/modules/provider-registry';

let controller: CallController | null = null;
let conversationEngine: ConversationEngine | null = null;
let transcriptService: TranscriptService | null = null;
let providers: RegisteredProviders | null = null;

export async function getProviders(): Promise<RegisteredProviders> {
  if (!providers) {
    const config = loadConfigFromEnv();
    providers = await createProviders(config);
  }
  return providers;
}

export async function getCallController(): Promise<CallController> {
  if (!controller) {
    const p = await getProviders();
    const config = loadConfigFromEnv();

    conversationEngine = new ConversationEngine(p.brain, p.callStore, {
      maxTurns: config.maxTurns,
    });

    transcriptService = new TranscriptService(p.callStore);

    const controllerConfig: CallControllerConfig = {
      fromNumber: config.twilioPhoneNumber || '',
      maxCallDurationSec: config.maxCallDurationSec,
      maxSilenceRetries: config.maxSilenceRetries,
    };

    controller = new CallController(
      p.telephony,
      p.callStore,
      conversationEngine,
      transcriptService,
      controllerConfig,
    );
  }
  return controller;
}

export async function getTranscriptService(): Promise<TranscriptService> {
  if (!transcriptService) {
    await getCallController();
  }
  return transcriptService!;
}
