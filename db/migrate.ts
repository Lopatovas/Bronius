import { Pool } from 'pg';

const MIGRATION_SQL = `
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
`;

async function migrate() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('DATABASE_URL is not set');
    process.exit(1);
  }

  const pool = new Pool({ connectionString: databaseUrl });
  try {
    console.log('Running migration...');
    await pool.query(MIGRATION_SQL);
    console.log('Migration completed successfully');
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

migrate();
