CREATE TABLE managed_calls (
  call_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES "user"(id),
  created_at INTEGER NOT NULL
);

CREATE INDEX managed_calls_user_created ON managed_calls(user_id, created_at DESC);

CREATE TABLE managed_call_attempts (
  attempt_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES "user"(id),
  status TEXT NOT NULL CHECK (status IN ('pending', 'created', 'rejected')),
  call_id TEXT REFERENCES managed_calls(call_id),
  created_at INTEGER NOT NULL
);

CREATE UNIQUE INDEX managed_call_one_pending_per_user ON managed_call_attempts(user_id) WHERE status = 'pending';
