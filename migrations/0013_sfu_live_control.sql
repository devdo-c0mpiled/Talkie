CREATE TABLE sfu_live_sessions (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES "user"(id),
  state TEXT NOT NULL CHECK (state IN ('ready', 'busy', 'unknown', 'closed')),
  track_kind TEXT CHECK (track_kind IN ('local', 'remote')),
  track_name TEXT,
  mid TEXT,
  expires_at INTEGER NOT NULL
);
CREATE INDEX sfu_live_sessions_owner ON sfu_live_sessions(owner_id, expires_at);
CREATE TABLE sfu_live_bridges (
  source_session TEXT PRIMARY KEY REFERENCES sfu_live_sessions(id),
  source_track TEXT NOT NULL,
  owner_id TEXT NOT NULL REFERENCES "user"(id),
  object_name TEXT NOT NULL UNIQUE,
  state TEXT NOT NULL CHECK (state IN ('starting', 'ready', 'stopping', 'unknown')),
  output_session TEXT,
  output_track TEXT,
  expires_at INTEGER NOT NULL
);
CREATE INDEX sfu_live_bridges_output ON sfu_live_bridges(owner_id, output_session, output_track, state);
