'use client';

import { useState, useEffect, useCallback, useRef, useMemo, type CSSProperties } from 'react';
import { useRouter } from 'next/navigation';

interface CallTurn {
  speaker: string;
  text: string;
  createdAt: string;
}

interface CallSession {
  id: string;
  toNumber: string;
  status: string;
  providerCallId?: string;
  endReason?: string;
  startedAt?: string;
  endedAt?: string;
  durationSec?: number;
  createdAt?: string;
  updatedAt?: string;
}

const TERMINAL_STATUSES = ['COMPLETED', 'FAILED'];

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const cardStyle: CSSProperties = {
  background: '#1e293b',
  borderRadius: 12,
  padding: 24,
  marginBottom: 24,
};

export default function Home() {
  const router = useRouter();

  const [phoneNumber, setPhoneNumber] = useState('');
  const [callId, setCallId] = useState<string | null>(null);
  const [session, setSession] = useState<CallSession | null>(null);
  const [transcript, setTranscript] = useState<CallTurn[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [referenceId, setReferenceId] = useState('');
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [sessionsList, setSessionsList] = useState<CallSession[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [sessionFilter, setSessionFilter] = useState('');

  const [brainPrompt, setBrainPrompt] = useState('Hello, this is a debug message.');
  const [brainBusy, setBrainBusy] = useState(false);
  const [brainLast, setBrainLast] = useState<string | null>(null);

  const [twilioBusy, setTwilioBusy] = useState(false);
  const [twilioLast, setTwilioLast] = useState<string | null>(null);

  const [storeBusy, setStoreBusy] = useState(false);
  const [storeLast, setStoreLast] = useState<string | null>(null);

  const [supabaseBusy, setSupabaseBusy] = useState(false);
  const [supabaseLast, setSupabaseLast] = useState<string | null>(null);

  const [ttsText, setTtsText] = useState('Hello! This is Bronius.');
  const [ttsBusy, setTtsBusy] = useState(false);
  const [ttsError, setTtsError] = useState<string | null>(null);
  const [ttsAudioUrl, setTtsAudioUrl] = useState<string | null>(null);

  const urlHydratedRef = useRef(false);

  const fetchSessionList = useCallback(async () => {
    setSessionsLoading(true);
    try {
      const res = await fetch('/api/v1/calls?limit=200');
      if (!res.ok) return;
      const data = (await res.json()) as { sessions: CallSession[] };
      setSessionsList(data.sessions);
    } catch {
      // ignore list errors (e.g. network)
    } finally {
      setSessionsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchSessionList();
  }, [fetchSessionList]);

  const filteredSessions = useMemo(() => {
    const q = sessionFilter.trim().toLowerCase();
    if (!q) return sessionsList;
    return sessionsList.filter((s) => {
      const id = s.id.toLowerCase();
      const to = s.toNumber.toLowerCase();
      const st = s.status.toLowerCase();
      const prov = (s.providerCallId || '').toLowerCase();
      return id.includes(q) || to.includes(q) || st.includes(q) || prov.includes(q);
    });
  }, [sessionsList, sessionFilter]);

  const isValidE164 = (num: string) => /^\+[1-9]\d{1,14}$/.test(num);

  const loadCallById = useCallback(async (id: string) => {
    const trimmed = id.trim();
    if (!UUID_RE.test(trimmed)) {
      setLookupError('Enter a valid call session UUID (from the API or Supabase).');
      return;
    }

    setLookupError(null);
    setLookupLoading(true);
    setError(null);
    try {
      const [sessionRes, transcriptRes] = await Promise.all([
        fetch(`/api/v1/calls/${encodeURIComponent(trimmed)}`),
        fetch(`/api/v1/calls/${encodeURIComponent(trimmed)}/transcript`),
      ]);

      if (!sessionRes.ok) {
        const data = (await sessionRes.json().catch(() => ({}))) as { error?: string };
        setLookupError(data.error || 'Session not found');
        setCallId(null);
        setSession(null);
        setTranscript([]);
        return;
      }

      const sessionData = (await sessionRes.json()) as { session: CallSession };
      const transcriptData = transcriptRes.ok
        ? ((await transcriptRes.json()) as { turns: CallTurn[] })
        : { turns: [] };

      setCallId(trimmed);
      setSession(sessionData.session);
      setTranscript(transcriptData.turns || []);
      router.replace(`/?call=${encodeURIComponent(trimmed)}`, { scroll: false });
      void fetchSessionList();
    } catch {
      setLookupError('Network error. Try again.');
    } finally {
      setLookupLoading(false);
    }
  }, [router, fetchSessionList]);

  useEffect(() => {
    if (urlHydratedRef.current) return;
    if (typeof window === 'undefined') return;
    const q = new URLSearchParams(window.location.search).get('call');
    if (q?.trim() && UUID_RE.test(q.trim())) {
      urlHydratedRef.current = true;
      void loadCallById(q.trim());
    }
  }, [loadCallById]);

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
      setReferenceId(data.callSessionId);
      router.replace(`/?call=${encodeURIComponent(data.callSessionId)}`, { scroll: false });
      void fetchSessionList();
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
    } catch (e) {
      setStoreLast(e instanceof Error ? e.message : 'Request failed');
    } finally {
      setStoreBusy(false);
    }
  };

  const runSupabasePing = async () => {
    setSupabaseBusy(true);
    setSupabaseLast(null);
    try {
      const res = await fetch('/api/v1/debug/supabase-ping', { method: 'POST' });
      const data = await res.json();
      setSupabaseLast(JSON.stringify(data, null, 2));
    } catch (e) {
      setSupabaseLast(e instanceof Error ? e.message : 'Request failed');
    } finally {
      setSupabaseBusy(false);
    }
  };

  const runTtsTest = async () => {
    const text = ttsText.trim();
    if (!text) return;

    setTtsBusy(true);
    setTtsError(null);

    if (ttsAudioUrl) {
      URL.revokeObjectURL(ttsAudioUrl);
      setTtsAudioUrl(null);
    }

    try {
      const res = await fetch(`/api/v1/tts?text=${encodeURIComponent(text)}&format=mp3`);
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as null | { error?: string };
        setTtsError(j?.error || `TTS failed (HTTP ${res.status})`);
        return;
      }
      const blob = await res.blob();
      setTtsAudioUrl(URL.createObjectURL(blob));
    } catch (e) {
      setTtsError(e instanceof Error ? e.message : 'Request failed');
    } finally {
      setTtsBusy(false);
    }
  };

  useEffect(() => {
    return () => {
      if (ttsAudioUrl) URL.revokeObjectURL(ttsAudioUrl);
    };
  }, [ttsAudioUrl]);

  const statusColor = (status: string) => {
    if (status === 'COMPLETED') return '#22c55e';
    if (status === 'FAILED') return '#ef4444';
    if (['CONNECTED', 'GREETING', 'LISTENING', 'RESPONDING'].includes(status)) return '#3b82f6';
    return '#f59e0b';
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
            Exercise each adapter without placing a call. Responses show below each control.
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

          <div style={{ marginBottom: 20 }}>
            <label
              style={{ display: 'block', marginBottom: 8, fontSize: 13, color: '#94a3b8', fontWeight: 600 }}
            >
              Text-to-speech (TTSPort)
            </label>
            <textarea
              value={ttsText}
              onChange={(e) => setTtsText(e.target.value)}
              rows={2}
              disabled={ttsBusy}
              placeholder="Type something, synthesize it, and play the audio…"
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
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
              <button
                type="button"
                onClick={runTtsTest}
                disabled={ttsBusy || !ttsText.trim()}
                style={{
                  padding: '8px 18px',
                  borderRadius: 8,
                  border: 'none',
                  background: ttsBusy ? '#475569' : '#f97316',
                  color: 'white',
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: ttsBusy || !ttsText.trim() ? 'not-allowed' : 'pointer',
                }}
              >
                {ttsBusy ? 'Synthesizing…' : 'Synthesize'}
              </button>
              {ttsAudioUrl && (
                <button
                  type="button"
                  onClick={() => {
                    URL.revokeObjectURL(ttsAudioUrl);
                    setTtsAudioUrl(null);
                  }}
                  disabled={ttsBusy}
                  style={{
                    padding: '8px 18px',
                    borderRadius: 8,
                    border: '1px solid #475569',
                    background: '#1e293b',
                    color: '#e2e8f0',
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: ttsBusy ? 'not-allowed' : 'pointer',
                  }}
                >
                  Clear audio
                </button>
              )}
            </div>
            {ttsError && <p style={{ color: '#f87171', marginTop: 10, fontSize: 14 }}>{ttsError}</p>}
            {ttsAudioUrl && (
              <div style={{ marginTop: 12 }}>
                <audio controls src={ttsAudioUrl} style={{ width: '100%' }} />
              </div>
            )}
            <p style={{ color: '#64748b', fontSize: 12, marginTop: 10, marginBottom: 0, lineHeight: 1.4 }}>
              Uses <code>/api/v1/tts</code>. Requires <code>MISTRAL_TTS_VOICE_ID</code> to be set; otherwise it will return
              “TTS not configured”.
            </p>
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
              onClick={runSupabasePing}
              disabled={supabaseBusy}
              style={{
                padding: '8px 18px',
                borderRadius: 8,
                border: 'none',
                background: supabaseBusy ? '#475569' : '#3ecf8e',
                color: '#0f172a',
                fontSize: 14,
                fontWeight: 600,
                cursor: supabaseBusy ? 'not-allowed' : 'pointer',
              }}
            >
              {supabaseBusy ? 'Checking…' : 'Ping Supabase'}
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
          {(twilioLast || supabaseLast || storeLast) && (
            <pre
              style={{
                marginTop: 8,
                padding: 12,
                background: '#0f172a',
                borderRadius: 8,
                fontSize: 12,
                overflow: 'auto',
                maxHeight: 240,
                color: '#cbd5e1',
              }}
            >
              {twilioLast && `Twilio:\n${twilioLast}\n\n`}
              {supabaseLast && `Supabase:\n${supabaseLast}\n\n`}
              {storeLast && `Call store:\n${storeLast}`}
            </pre>
          )}
        </div>

        <div style={cardStyle}>
          <h2 style={{ fontSize: 18, fontWeight: 600, marginTop: 0, marginBottom: 8 }}>
            Load a persisted call
          </h2>
          <p style={{ color: '#94a3b8', fontSize: 14, marginTop: 0, marginBottom: 16, lineHeight: 1.5 }}>
            Choose a session from the list (newest first), filter by id, phone number, status, or Twilio
            CallSid. You can also open{' '}
            <code style={{ color: '#94a3b8' }}>/?call=&lt;uuid&gt;</code> directly.
          </p>
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
              onClick={() => void fetchSessionList()}
              disabled={sessionsLoading}
              style={{
                padding: '8px 16px',
                borderRadius: 8,
                border: '1px solid #475569',
                background: sessionsLoading ? '#334155' : '#1e293b',
                color: '#e2e8f0',
                fontSize: 14,
                fontWeight: 600,
                cursor: sessionsLoading ? 'not-allowed' : 'pointer',
              }}
            >
              {sessionsLoading ? 'Refreshing…' : 'Refresh list'}
            </button>
            <span style={{ fontSize: 13, color: '#64748b' }}>
              {sessionsList.length} session{sessionsList.length === 1 ? '' : 's'}
            </span>
          </div>
          <label
            style={{ display: 'block', marginBottom: 8, fontSize: 13, color: '#94a3b8', fontWeight: 600 }}
          >
            Search / filter
          </label>
          <input
            type="search"
            value={sessionFilter}
            onChange={(e) => setSessionFilter(e.target.value)}
            placeholder="Type to filter by id, number, status, CallSid…"
            autoComplete="off"
            style={{
              width: '100%',
              boxSizing: 'border-box',
              padding: '10px 14px',
              borderRadius: 8,
              border: '1px solid #334155',
              background: '#0f172a',
              color: '#e2e8f0',
              fontSize: 14,
              outline: 'none',
              marginBottom: 12,
            }}
          />
          <label
            style={{ display: 'block', marginBottom: 8, fontSize: 13, color: '#94a3b8', fontWeight: 600 }}
          >
            Session
          </label>
          <select
            value={referenceId}
            onChange={(e) => setReferenceId(e.target.value)}
            size={Math.min(10, Math.max(3, filteredSessions.length + 1))}
            disabled={lookupLoading}
            style={{
              width: '100%',
              boxSizing: 'border-box',
              padding: '8px 10px',
              borderRadius: 8,
              border: '1px solid #334155',
              background: '#0f172a',
              color: '#e2e8f0',
              fontSize: 13,
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
              marginBottom: 12,
            }}
          >
            <option value="">— Select a call session —</option>
            {filteredSessions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.toNumber} · {s.status}
                {s.providerCallId ? ` · ${s.providerCallId}` : ''} · {s.id}
              </option>
            ))}
          </select>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <button
              type="button"
              onClick={() => void loadCallById(referenceId)}
              disabled={lookupLoading || !referenceId.trim()}
              style={{
                padding: '10px 20px',
                borderRadius: 8,
                border: 'none',
                background: lookupLoading ? '#475569' : '#8b5cf6',
                color: 'white',
                fontSize: 14,
                fontWeight: 600,
                cursor: lookupLoading || !referenceId.trim() ? 'not-allowed' : 'pointer',
              }}
            >
              {lookupLoading ? 'Loading…' : 'Load call'}
            </button>
          </div>
          {lookupError && (
            <p style={{ color: '#f87171', marginTop: 12, fontSize: 14 }}>{lookupError}</p>
          )}
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
