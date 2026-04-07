import { TTSPort, TTSOptions, TTSResult, TTSFormat } from '@/core/ports/tts.port';

const MISTRAL_API_BASE = 'https://api.mistral.ai/v1';

function contentTypeFor(format: TTSFormat): string {
  switch (format) {
    case 'mp3':
      return 'audio/mpeg';
    case 'wav':
      return 'audio/wav';
    case 'opus':
      // Commonly used for Opus-in-Ogg containers.
      return 'audio/ogg';
    case 'flac':
      return 'audio/flac';
    case 'pcm':
      // Raw float32 LE samples (per Mistral docs). Not directly playable by browsers without headers.
      return 'application/octet-stream';
  }
}

export class MistralTTSAdapter implements TTSPort {
  constructor(
    private apiKey: string,
    private voiceId: string,
    private model: string = 'voxtral-mini-tts-2603',
  ) {}

  private assertConfigured(): void {
    if (!this.apiKey) {
      throw new Error('Mistral TTS not configured: missing MISTRAL_API_KEY.');
    }
    if (!this.voiceId) {
      throw new Error('Mistral TTS not configured: missing MISTRAL_TTS_VOICE_ID.');
    }
  }

  async synthesize(text: string, options?: TTSOptions): Promise<TTSResult> {
    this.assertConfigured();

    const format = options?.format ?? 'mp3';
    const voiceId = options?.voiceId ?? this.voiceId;

    const res = await fetch(`${MISTRAL_API_BASE}/audio/speech`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.model,
        input: text,
        voice_id: voiceId,
        response_format: format,
        stream: false,
      }),
    });

    const json = (await res.json().catch(() => null)) as null | { audio_data?: string; message?: string };
    if (!res.ok) {
      throw new Error(
        `Mistral TTS error: ${json?.message || res.statusText} (HTTP ${res.status})`,
      );
    }
    if (!json?.audio_data) {
      throw new Error('Mistral TTS error: missing audio_data in response.');
    }

    const audio = Buffer.from(json.audio_data, 'base64');
    return {
      contentType: contentTypeFor(format),
      audio,
    };
  }
}

