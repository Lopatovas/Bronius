export interface TTSResult {
  contentType: string;
  audio: Uint8Array;
}

export type TTSFormat = 'mp3' | 'wav' | 'opus' | 'pcm' | 'flac';

export interface TTSOptions {
  format?: TTSFormat;
  voiceId?: string;
}

export interface TTSPort {
  synthesize(text: string, options?: TTSOptions): Promise<TTSResult>;
}
