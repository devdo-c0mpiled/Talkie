CREATE TABLE test_payments (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  amount INTEGER NOT NULL CHECK (amount > 0),
  status TEXT NOT NULL DEFAULT 'CREATED' CHECK (status IN ('CREATED','CONFIRMING','PAID')),
  payment_key TEXT,
  created_at INTEGER NOT NULL,
  confirmed_at INTEGER
);
CREATE INDEX test_payments_user ON test_payments(user_id, created_at);
