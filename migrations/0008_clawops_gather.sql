CREATE TABLE clawops_gather_tokens (
  call_hash TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL,
  caller_hash TEXT,
  to_hash TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  consumed_at INTEGER
);
