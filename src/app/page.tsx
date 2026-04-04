'use client';

import { useState, useEffect, useCallback, useRef, type CSSProperties } from 'react';

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

interface TraceEntry {
  id: string;
  at: string;
  kind: string;
  label: string;
  callSessionId?: string;
  meta: Record<string, unknown>;
}

const TERMINAL_STATUSES = ['COMPLETED', 'FAILED'];

const cardStyle: CSSProperties = {
  background: '#1e293b',
  borderRadius: 12,
  padding: 24,
  marginBottom: 24,
};

export default function Home() {
  const [phoneNumber, setPhoneNumber] = useState('');
  const [callId, setCallId] = useState<string | null>(null);
  const [session, setSession] = useState<CallSession | null>(null);
  const [transcript, setTranscript] = useState<CallTurn[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [brainPrompt, setBrainPrompt] = useState('Hello, this is a debug message.');
  const [brainBusy, setBrainBusy] = useState(false);
  const [brainLast, setBrainLast] = useState<string | null>(null);

  const [twilioBusy, setTwilioBusy] = useState(false);
  const [twilioLast, setTwilioLast] = useState<string | null>(null);

  const [storeBusy, setStoreBusy] = useState(false);
  const [storeLast, setStoreLast] = useState<string | null>(null);

  const [traceEntries, setTraceEntries] = useState<TraceEntry[]>([]);
  const [liveTrace, setLiveTrace] = useState(true);
  const lastTraceIdRef = useRef<string | null>(null);
  const traceEndRef = useRef<HTMLPreElement | null>(null);

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
    } catch {
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

  const fetchTraceOnce = useCallback(async () => {
    const since = lastTraceIdRef.current;
    const q = since ? `?sinceId=${encodeURIComponent(since)}` : '';
    const res = await fetch(`/api/v1/debug/trace${q}`);
    if (!res.ok) return;
    const data = (await res.json()) as {
      entries: TraceEntry[];
      resetSuggested?: boolean;
    };

    if (!since || data.resetSuggested) {
      setTraceEntries(data.entries);
    } else {
      setTraceEntries((prev) => [...prev, ...data.entries]);
    }

    if (data.entries.length > 0) {
      lastTraceIdRef.current = data.entries[data.entries.length - 1].id;
    }
  }, []);

  useEffect(() => {
    if (!liveTrace) return;
    void fetchTraceOnce();
    const t = setInterval(() => void fetchTraceOnce(), 2000);
    return () => clearInterval(t);
  }, [liveTrace, fetchTraceOnce]);

  useEffect(() => {
    if (liveTrace && traceEndRef.current) {
      traceEndRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [traceEntries, liveTrace]);

  const clearTrace = async () => {
    await fetch('/api/v1/debug/trace/clear', { method: 'POST' });
    lastTraceIdRef.current = null;
    setTraceEntries([]);
    void fetchTraceOnce();
  };

  const runBrainPing = async () => {
    setBrainBusy(true);
    setBrainLast(null);
    try {
      const res = await fetch('/api/v1/debug/brain-ping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: brainPrompt }),
      });
      const data = await res.json();
      setBrainLast(JSON.stringify(data, null, 2));
      void fetchTraceOnce();
    } catch (e) {
      setBrainLast(e instanceof Error ? e.message : 'Request failed');
    } finally {
      setBrainBusy(false);
    }
  };

  const runTwilioPing = async () => {
    setTwilioBusy(true);
    setTwilioLast(null);
    try {
      const res = await fetch('/api/v1/debug/twilio-ping', { method: 'POST' });
      const data = await res.json();
      setTwilioLast(JSON.stringify(data, null, 2));
      void fetchTraceOnce();
    } catch (e) {
      setTwilioLast(e instanceof Error ? e.message : 'Request failed');
    } finally {
      setTwilioBusy(false);
    }
  };

  const runStorePing = async () => {
    setStoreBusy(true);
    setStoreLast(null);
    try {
      const res = await fetch('/api/v1/debug/call-store-ping', { method: 'POST' });
      const data = await res.json();
      setStoreLast(JSON.stringify(data, null, 2));
      void fetchTraceOnce();
    } catch (e) {
      setStoreLast(e instanceof Error ? e.message : 'Request failed');
    } finally {
      setStoreBusy(false);
    }
  };

  const statusColor = (status: string) => {
    if (status === 'COMPLETED') return '#22c55e';
    if (status === 'FAILED') return '#ef4444';
    if (['CONNECTED', 'GREETING', 'LISTENING', 'RESPONDING'].includes(status)) return '#3b82f6';
    return '#f59e0b';
  };

  const kindColor = (kind: string) => {
    if (kind === 'twilio_rest') return '#a78bfa';
    if (kind === 'twilio_webhook') return '#38bdf8';
    if (kind === 'brain') return '#f472b6';
    if (kind === 'api') return '#fbbf24';
    if (kind === 'debug_tool') return '#34d399';
    return '#94a3b8';
  };

  return (
    <div style={{ minHeight: '100vh', background: '#0f172a', color: '#e2e8f0' }}>
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '48px 24px' }}>
        <h1 style={{ fontSize: 32, fontWeight: 700, marginBottom: 8 }}>Bronius</h1>
        <p style={{ color: '#94a3b8', marginBottom: 32 }}>AI Phone Agent POC</p>

        <div style={cardStyle}>
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
              type="button"
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
          {error && <p style={{ color: '#ef4444', marginTop: 8, fontSize: 14 }}>{error}</p>}
        </div>

        <div style={cardStyle}>
          <h2 style={{ fontSize: 18, fontWeight: 600, marginTop: 0, marginBottom: 8 }}>
            Integration checks
          </h2>
          <p style={{ color: '#94a3b8', fontSize: 14, marginTop: 0, marginBottom: 20, lineHeight: 1.5 }}>
            Exercise each adapter without a live call. Results also appear in the live trace below.
          </p>

          <div style={{ marginBottom: 20 }}>
            <label
              style={{ display: 'block', marginBottom: 8, fontSize: 13, color: '#94a3b8', fontWeight: 600 }}
            >
              LLM brain (BrainPort)
            </label>
            <textarea
              value={brainPrompt}
              onChange={(e) => setBrainPrompt(e.target.value)}
              rows={3}
              disabled={brainBusy}
              style={{
                width: '100%',
                boxSizing: 'border-box',
                padding: '10px 14px',
                borderRadius: 8,
                border: '1px solid #334155',
                background: '#0f172a',
                color: '#e2e8f0',
                fontSize: 14,
                resize: 'vertical',
                marginBottom: 8,
              }}
            />
            <button
              type="button"
              onClick={runBrainPing}
              disabled={brainBusy}
              style={{
                padding: '8px 18px',
                borderRadius: 8,
                border: 'none',
                background: brainBusy ? '#475569' : '#6366f1',
                color: 'white',
                fontSize: 14,
                fontWeight: 600,
                cursor: brainBusy ? 'not-allowed' : 'pointer',
              }}
            >
              {brainBusy ? 'Running…' : 'Ping brain'}
            </button>
            {brainLast && (
              <pre
                style={{
                  marginTop: 12,
                  padding: 12,
                  background: '#0f172a',
                  borderRadius: 8,
                  fontSize: 12,
                  overflow: 'auto',
                  maxHeight: 220,
                  color: '#cbd5e1',
                }}
              >
                {brainLast}
              </pre>
            )}
          </div>

          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 12,
              alignItems: 'center',
              marginBottom: 12,
            }}
          >
            <button
              type="button"
              onClick={runTwilioPing}
              disabled={twilioBusy}
              style={{
                padding: '8px 18px',
                borderRadius: 8,
                border: 'none',
                background: twilioBusy ? '#475569' : '#0ea5e9',
                color: 'white',
                fontSize: 14,
                fontWeight: 600,
                cursor: twilioBusy ? 'not-allowed' : 'pointer',
              }}
            >
              {twilioBusy ? 'Checking…' : 'Ping Twilio REST'}
            </button>
            <button
              type="button"
              onClick={runStorePing}
              disabled={storeBusy}
              style={{
                padding: '8px 18px',
                borderRadius: 8,
                border: 'none',
                background: storeBusy ? '#475569' : '#059669',
                color: 'white',
                fontSize: 14,
                fontWeight: 600,
                cursor: storeBusy ? 'not-allowed' : 'pointer',
              }}
            >
              {storeBusy ? 'Running…' : 'Ping call store'}
            </button>
          </div>
          {(twilioLast || storeLast) && (
            <pre
              style={{
                marginTop: 8,
                padding: 12,
                background: '#0f172a',
                borderRadius: 8,
                fontSize: 12,
                overflow: 'auto',
                maxHeight: 200,
                color: '#cbd5e1',
              }}
            >
              {twilioLast && `Twilio:\n${twilioLast}\n\n`}
              {storeLast && `Call store:\n${storeLast}`}
            </pre>
          )}
        </div>

        <div style={cardStyle}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: 12,
              marginBottom: 16,
            }}
          >
            <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>Live integration trace</h2>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <label style={{ fontSize: 13, color: '#94a3b8', display: 'flex', alignItems: 'center', gap: 6 }}>
                <input
                  type="checkbox"
                  checked={liveTrace}
                  onChange={(e) => setLiveTrace(e.target.checked)}
                />
                Auto-refresh (2s)
              </label>
              <button
                type="button"
                onClick={() => void fetchTraceOnce()}
                style={{
                  padding: '6px 14px',
                  borderRadius: 8,
                  border: '1px solid #475569',
                  background: '#334155',
                  color: '#e2e8f0',
                  fontSize: 13,
                  cursor: 'pointer',
                }}
              >
                Refresh now
              </button>
              <button
                type="button"
                onClick={() => void clearTrace()}
                style={{
                  padding: '6px 14px',
                  borderRadius: 8,
                  border: '1px solid #7f1d1d',
                  background: '#450a0a',
                  color: '#fecaca',
                  fontSize: 13,
                  cursor: 'pointer',
                }}
              >
                Clear
              </button>
            </div>
          </div>
          <p style={{ color: '#64748b', fontSize: 12, marginTop: 0, marginBottom: 12, lineHeight: 1.5 }}>
            Twilio REST calls, webhook payloads, TwiML responses, LLM requests/replies, and API activity.
            The buffer is <strong style={{ color: '#94a3b8' }}>in-memory per server instance</strong> — on
            Vercel/serverless, voice and gather webhooks often hit a different instance than this page, so
            those lines may be missing here even when Twilio delivered them (check Twilio Debugger and
            deployment logs). Set <code style={{ color: '#94a3b8' }}>INTEGRATION_TRACE=0</code> to disable
            tracing.
          </p>
          <div
            style={{
              maxHeight: 420,
              overflowY: 'auto',
              background: '#0f172a',
              borderRadius: 8,
              border: '1px solid #334155',
              padding: 12,
            }}
          >
            {traceEntries.length === 0 ? (
              <p style={{ color: '#64748b', fontSize: 14, margin: 8 }}>No trace entries yet.</p>
            ) : (
              traceEntries.map((e) => (
                <div
                  key={e.id}
                  style={{
                    borderLeft: `3px solid ${kindColor(e.kind)}`,
                    paddingLeft: 10,
                    marginBottom: 14,
                  }}
                >
                  <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>
                    {e.at} ·{' '}
                    <span style={{ color: kindColor(e.kind), fontWeight: 600 }}>{e.kind}</span>
                    {e.callSessionId ? ` · ${e.callSessionId}` : ''}
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>{e.label}</div>
                  <pre
                    style={{
                      margin: 0,
                      fontSize: 11,
                      color: '#94a3b8',
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                    }}
                  >
                    {JSON.stringify(e.meta, null, 2)}
                  </pre>
                </div>
              ))
            )}
            <pre ref={traceEndRef} style={{ margin: 0, height: 1 }} />
          </div>
        </div>

        {session && (
          <div style={cardStyle}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 16,
              }}
            >
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
          <div style={{ ...cardStyle, marginBottom: 0 }}>
            <h2 style={{ fontSize: 18, fontWeight: 600, marginTop: 0, marginBottom: 16 }}>Transcript</h2>
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
