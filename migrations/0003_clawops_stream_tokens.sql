CREATE TABLE clawops_stream_tokens (
  call_hash TEXT NOT NULL PRIMARY KEY,
  token_hash TEXT,
  expires_at INTEGER NOT NULL
);
