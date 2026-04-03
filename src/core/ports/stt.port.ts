export interface STTResult {
  text: string;
  confidence?: number;
}

export interface STTPort {
  transcribe(audioUrl: string): Promise<STTResult>;
}
