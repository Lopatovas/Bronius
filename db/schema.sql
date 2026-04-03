-- Run this in your Supabase SQL Editor (Dashboard > SQL Editor > New query)

CREATE TABLE IF NOT EXISTS call_sessions (
  id UUID PRIMARY KEY,
  to_number VARCHAR(20) NOT NULL,
  provider_call_id VARCHAR(64),
  status VARCHAR(20) NOT NULL DEFAULT 'INIT',
  end_reason VARCHAR(30),
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  duration_sec INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS call_turns (
  id UUID PRIMARY KEY,
  call_session_id UUID NOT NULL REFERENCES call_sessions(id),
  turn_index INTEGER NOT NULL,
  speaker VARCHAR(10) NOT NULL CHECK (speaker IN ('agent', 'human', 'system')),
  text TEXT NOT NULL,
  confidence REAL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_call_turns_session_id ON call_turns(call_session_id);
CREATE INDEX IF NOT EXISTS idx_call_turns_ordering ON call_turns(call_session_id, turn_index);
CREATE INDEX IF NOT EXISTS idx_call_sessions_status ON call_sessions(status);

-- Enable Row Level Security (service role key bypasses RLS)
ALTER TABLE call_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE call_turns ENABLE ROW LEVEL SECURITY;
