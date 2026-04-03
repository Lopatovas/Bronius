import { CallStatus } from './types';

const VALID_TRANSITIONS: Record<CallStatus, CallStatus[]> = {
  INIT: ['DIALING', 'FAILED'],
  DIALING: ['RINGING', 'CONNECTED', 'FAILED'],
  RINGING: ['CONNECTED', 'FAILED'],
  CONNECTED: ['GREETING', 'FAILED', 'HANGUP'],
  GREETING: ['LISTENING', 'FAILED', 'HANGUP'],
  LISTENING: ['RESPONDING', 'CLOSING', 'FAILED', 'HANGUP'],
  RESPONDING: ['LISTENING', 'CLOSING', 'FAILED', 'HANGUP'],
  CLOSING: ['HANGUP', 'FAILED'],
  HANGUP: ['COMPLETED', 'FAILED'],
  COMPLETED: [],
  FAILED: [],
};

export function isValidTransition(from: CallStatus, to: CallStatus): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

export function getValidTransitions(from: CallStatus): CallStatus[] {
  return VALID_TRANSITIONS[from] ?? [];
}
