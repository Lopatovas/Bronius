import { describe, it, expect } from 'vitest';
import { isValidTransition, getValidTransitions } from '@/core/domain/transitions';
import { CallStatus } from '@/core/domain/types';

describe('State Transitions', () => {
  it('should allow INIT -> DIALING', () => {
    expect(isValidTransition('INIT', 'DIALING')).toBe(true);
  });

  it('should allow INIT -> FAILED', () => {
    expect(isValidTransition('INIT', 'FAILED')).toBe(true);
  });

  it('should not allow INIT -> CONNECTED directly', () => {
    expect(isValidTransition('INIT', 'CONNECTED')).toBe(false);
  });

  it('should allow DIALING -> RINGING', () => {
    expect(isValidTransition('DIALING', 'RINGING')).toBe(true);
  });

  it('should allow DIALING -> CONNECTED (skip ringing)', () => {
    expect(isValidTransition('DIALING', 'CONNECTED')).toBe(true);
  });

  it('should allow LISTENING -> RESPONDING', () => {
    expect(isValidTransition('LISTENING', 'RESPONDING')).toBe(true);
  });

  it('should allow RESPONDING -> LISTENING (back and forth)', () => {
    expect(isValidTransition('RESPONDING', 'LISTENING')).toBe(true);
  });

  it('should allow RESPONDING -> CLOSING', () => {
    expect(isValidTransition('RESPONDING', 'CLOSING')).toBe(true);
  });

  it('should allow CLOSING -> HANGUP', () => {
    expect(isValidTransition('CLOSING', 'HANGUP')).toBe(true);
  });

  it('should allow HANGUP -> COMPLETED', () => {
    expect(isValidTransition('HANGUP', 'COMPLETED')).toBe(true);
  });

  it('should not allow backward transition CONNECTED -> DIALING', () => {
    expect(isValidTransition('CONNECTED', 'DIALING')).toBe(false);
  });

  it('should not allow transition from COMPLETED', () => {
    expect(isValidTransition('COMPLETED', 'INIT')).toBe(false);
    expect(getValidTransitions('COMPLETED')).toEqual([]);
  });

  it('should not allow transition from FAILED', () => {
    expect(isValidTransition('FAILED', 'INIT')).toBe(false);
    expect(getValidTransitions('FAILED')).toEqual([]);
  });

  it('should allow all statuses to transition to FAILED (except terminal)', () => {
    const nonTerminal: CallStatus[] = [
      'INIT', 'DIALING', 'RINGING', 'CONNECTED', 'GREETING',
      'LISTENING', 'RESPONDING', 'CLOSING', 'HANGUP',
    ];
    for (const status of nonTerminal) {
      expect(isValidTransition(status, 'FAILED')).toBe(true);
    }
  });

  it('should list valid transitions from LISTENING', () => {
    const valid = getValidTransitions('LISTENING');
    expect(valid).toContain('RESPONDING');
    expect(valid).toContain('CLOSING');
    expect(valid).toContain('FAILED');
    expect(valid).toContain('HANGUP');
    expect(valid).not.toContain('INIT');
  });
});
