import type { STTPort, STTResult } from '@/core/ports/stt.port';

const MISTRAL_API_BASE = 'https://api.mistral.ai/v1';

export class MistralSTTAdapter implements STTPort {
  constructor(
    private apiKey: string,
    private model: string = 'voxtral-mini-latest',
  ) {}

  private assertConfigured(): void {
    if (!this.apiKey) {
      throw new Error('Mistral STT not configured: missing MISTRAL_API_KEY.');
    }
  }

  async transcribe(params: { audio: Uint8Array; mimeType: string; language?: string }): Promise<STTResult> {
    this.assertConfigured();

    const form = new FormData();
    form.append('model', this.model);
    if (params.language) form.append('language', params.language);

    const blob = new Blob([params.audio], { type: params.mimeType || 'application/octet-stream' });
    form.append('file', blob, 'audio.webm');

    const res = await fetch(`${MISTRAL_API_BASE}/audio/transcriptions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: form,
    });

    const json = (await res.json().catch(() => null)) as null | { text?: string; message?: string };
    if (!res.ok) {
      throw new Error(`Mistral STT error: ${json?.message || res.statusText} (HTTP ${res.status})`);
    }
    const text = (json?.text || '').trim();
    return { text };
  }
}

