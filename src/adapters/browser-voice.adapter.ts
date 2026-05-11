import type { BrowserVoicePort, BrowserVoiceTurnRequest, BrowserVoiceTurnResponse } from '@/core/ports/browser-voice.port';
import type { RegisteredProviders } from '@/core/modules/provider-registry';
import type { CallController } from '@/core/modules/call-controller';
import { generateId } from '@/lib/id';

export class BrowserVoiceAdapter implements BrowserVoicePort {
  constructor(
    private controller: CallController,
    private providers: RegisteredProviders,
  ) {}

  async handleTextTurn(req: BrowserVoiceTurnRequest): Promise<BrowserVoiceTurnResponse> {
    let text = req.text.trim();
    if (req.audioBase64) {
      if (!this.providers.stt) {
        throw new Error('STT not configured');
      }
      const audio = Buffer.from(req.audioBase64, 'base64');
      const result = await this.providers.stt.transcribe({
        audio,
        mimeType: 'audio/webm',
        language: 'en',
      });
      text = result.text.trim();
    }

    if (!text) throw new Error('Missing text');

    // call_sessions.id is a UUID in Supabase. Keep this a plain UUID to remain compatible.
    const callSessionId = req.callSessionId || generateId();

    const existing = await this.providers.callStore.getSession(callSessionId);
    if (!existing) {
      await this.providers.callStore.createSession({ id: callSessionId, toNumber: 'browser' });
      // Put the session into a state where `handleGatherResult` transitions cleanly.
      await this.controller.transitionStatus(callSessionId, 'CONNECTED');
    }

    const actions = await this.controller.handleGatherResult(callSessionId, text, 1.0);
    const replyText =
      actions.find((a) => a.type === 'say' && a.text && a.text.trim())?.text?.trim() || '';

    if (!replyText) {
      throw new Error('No reply produced');
    }

    const sessionAfter = await this.providers.callStore.getSession(callSessionId);

    if (!this.providers.tts) {
      throw new Error('TTS not configured');
    }

    const audio = await this.providers.tts.synthesize(replyText, { format: 'mp3' });

    return {
      callSessionId,
      replyText,
      audioContentType: audio.contentType,
      audioBase64: Buffer.from(audio.audio).toString('base64'),
      status: sessionAfter?.status,
      endReason: sessionAfter?.endReason,
    };
  }
}

