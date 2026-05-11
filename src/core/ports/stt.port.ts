export interface STTResult {
  text: string;
  confidence?: number;
}

export interface STTPort {
  transcribe(params: { audio: Uint8Array; mimeType: string; language?: string }): Promise<STTResult>;
}
