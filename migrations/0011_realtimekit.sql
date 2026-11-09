CREATE TABLE realtimekit_sessions (
  id TEXT PRIMARY KEY,
  caller_id TEXT NOT NULL REFERENCES "user"(id),
  guest_hash TEXT,
  state TEXT NOT NULL CHECK (state IN ('creating', 'ready', 'failed')),
  meeting_id TEXT,
  caller_issued INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX realtimekit_sessions_caller ON realtimekit_sessions(caller_id, created_at);
