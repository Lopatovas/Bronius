'use client';

import { useState, useEffect, useCallback } from 'react';

interface CallTurn {
  speaker: string;
  text: string;
  createdAt: string;
}

interface CallSession {
  id: string;
  toNumber: string;
  status: string;
  endReason?: string;
  startedAt?: string;
  endedAt?: string;
  durationSec?: number;
}

const TERMINAL_STATUSES = ['COMPLETED', 'FAILED'];

export default function Home() {
  const [phoneNumber, setPhoneNumber] = useState('');
  const [callId, setCallId] = useState<string | null>(null);
  const [session, setSession] = useState<CallSession | null>(null);
  const [transcript, setTranscript] = useState<CallTurn[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const isValidE164 = (num: string) => /^\+[1-9]\d{1,14}$/.test(num);

  const startCall = async () => {
    setError(null);
    if (!isValidE164(phoneNumber)) {
      setError('Enter a valid E.164 phone number (e.g. +14155552671)');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/v1/calls', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ toNumber: phoneNumber }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to start call');
        return;
      }
      setCallId(data.callSessionId);
      setSession(data.session);
      setTranscript([]);
    } catch (err) {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const pollStatus = useCallback(async () => {
    if (!callId) return;
    try {
      const [sessionRes, transcriptRes] = await Promise.all([
        fetch(`/api/v1/calls/${callId}`),
        fetch(`/api/v1/calls/${callId}/transcript`),
      ]);
      if (sessionRes.ok) {
        const sessionData = await sessionRes.json();
        setSession(sessionData.session);
      }
      if (transcriptRes.ok) {
        const transcriptData = await transcriptRes.json();
        setTranscript(transcriptData.turns);
      }
    } catch {
      // Silently ignore poll errors
    }
  }, [callId]);

  useEffect(() => {
    if (!callId) return;
    if (session && TERMINAL_STATUSES.includes(session.status)) return;

    const interval = setInterval(pollStatus, 2000);
    return () => clearInterval(interval);
  }, [callId, session, pollStatus]);

  const statusColor = (status: string) => {
    if (status === 'COMPLETED') return '#22c55e';
    if (status === 'FAILED') return '#ef4444';
    if (['CONNECTED', 'GREETING', 'LISTENING', 'RESPONDING'].includes(status)) return '#3b82f6';
    return '#f59e0b';
  };

  return (
    <div style={{ minHeight: '100vh', background: '#0f172a', color: '#e2e8f0' }}>
      <div style={{ maxWidth: 640, margin: '0 auto', padding: '48px 24px' }}>
        <h1 style={{ fontSize: 32, fontWeight: 700, marginBottom: 8 }}>Bronius</h1>
        <p style={{ color: '#94a3b8', marginBottom: 32 }}>AI Phone Agent POC</p>

        <div
          style={{
            background: '#1e293b',
            borderRadius: 12,
            padding: 24,
            marginBottom: 24,
          }}
        >
          <label style={{ display: 'block', marginBottom: 8, fontSize: 14, color: '#94a3b8' }}>
            Phone Number (E.164)
          </label>
          <div style={{ display: 'flex', gap: 12 }}>
            <input
              type="tel"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              placeholder="+14155552671"
              disabled={loading}
              style={{
                flex: 1,
                padding: '10px 14px',
                borderRadius: 8,
                border: '1px solid #334155',
                background: '#0f172a',
                color: '#e2e8f0',
                fontSize: 16,
                outline: 'none',
              }}
            />
            <button
              onClick={startCall}
              disabled={loading || !phoneNumber}
              style={{
                padding: '10px 24px',
                borderRadius: 8,
                border: 'none',
                background: loading ? '#475569' : '#3b82f6',
                color: 'white',
                fontSize: 16,
                fontWeight: 600,
                cursor: loading ? 'not-allowed' : 'pointer',
              }}
            >
              {loading ? 'Calling...' : 'Call'}
            </button>
          </div>
          {error && (
            <p style={{ color: '#ef4444', marginTop: 8, fontSize: 14 }}>{error}</p>
          )}
        </div>

        {session && (
          <div
            style={{
              background: '#1e293b',
              borderRadius: 12,
              padding: 24,
              marginBottom: 24,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>Call Status</h2>
              <span
                style={{
                  padding: '4px 12px',
                  borderRadius: 9999,
                  background: statusColor(session.status) + '22',
                  color: statusColor(session.status),
                  fontSize: 13,
                  fontWeight: 600,
                }}
              >
                {session.status}
              </span>
            </div>
            <div style={{ fontSize: 14, color: '#94a3b8' }}>
              <p style={{ margin: '4px 0' }}>To: {session.toNumber}</p>
              <p style={{ margin: '4px 0' }}>ID: {session.id}</p>
              {session.endReason && <p style={{ margin: '4px 0' }}>Reason: {session.endReason}</p>}
              {session.durationSec !== undefined && (
                <p style={{ margin: '4px 0' }}>Duration: {session.durationSec}s</p>
              )}
            </div>
          </div>
        )}

        {transcript.length > 0 && (
          <div
            style={{
              background: '#1e293b',
              borderRadius: 12,
              padding: 24,
            }}
          >
            <h2 style={{ fontSize: 18, fontWeight: 600, marginTop: 0, marginBottom: 16 }}>
              Transcript
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {transcript.map((turn, i) => (
                <div
                  key={i}
                  style={{
                    display: 'flex',
                    gap: 12,
                    flexDirection: turn.speaker === 'agent' ? 'row' : 'row-reverse',
                  }}
                >
                  <div
                    style={{
                      padding: '10px 14px',
                      borderRadius: 12,
                      maxWidth: '80%',
                      background: turn.speaker === 'agent' ? '#1d4ed8' : '#334155',
                      fontSize: 14,
                      lineHeight: 1.5,
                    }}
                  >
                    <span style={{ fontSize: 11, color: '#94a3b8', textTransform: 'uppercase' }}>
                      {turn.speaker}
                    </span>
                    <p style={{ margin: '4px 0 0' }}>{turn.text}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
