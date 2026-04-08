export interface BrowserVoiceTurnRequest {
  callSessionId?: string;
  text: string;

  /**
   * Placeholder for STT/WebRTC v2:
   * - Provide audio frames/chunks instead of text
   * - STTPort would convert to text incrementally
   */
  audioBase64?: string;
}

export interface BrowserVoiceTurnResponse {
  callSessionId: string;
  replyText: string;
  audioContentType: string;
  audioBase64: string;
  status?: string;
  endReason?: string;
}

export interface BrowserVoicePort {
  handleTextTurn(req: BrowserVoiceTurnRequest): Promise<BrowserVoiceTurnResponse>;
}

