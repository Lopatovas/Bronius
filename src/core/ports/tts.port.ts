export interface TTSResult {
  audioUrl: string;
}

export interface TTSPort {
  synthesize(text: string): Promise<TTSResult>;
}
