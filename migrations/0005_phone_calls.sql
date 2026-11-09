CREATE TABLE IF NOT EXISTS phone_calls (
  call_id TEXT PRIMARY KEY,
  mode TEXT NOT NULL,
  business TEXT NOT NULL,
  request_json TEXT NOT NULL,
  outcome TEXT,
  result_json TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
