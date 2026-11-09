CREATE TABLE live_calls (
  intent TEXT PRIMARY KEY,
  action_id TEXT UNIQUE,
  destination TEXT,
  instruction TEXT,
  direction TEXT NOT NULL DEFAULT 'outbound' CHECK (direction IN ('outbound', 'inbound')),
  call_id TEXT UNIQUE,
  bridge_started_at INTEGER,
  bridge_finished_at INTEGER,
  bridge_failed_at INTEGER,
  provider_completed_at INTEGER,
  CHECK ((direction = 'outbound' AND action_id IS NOT NULL AND destination IS NOT NULL AND instruction IS NOT NULL)
      OR (direction = 'inbound' AND action_id IS NULL AND destination IS NULL AND instruction IS NULL AND call_id IS NOT NULL))
);

CREATE TABLE inbound_conversations (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL,
  caller_number TEXT,
  created_at INTEGER NOT NULL,
  UNIQUE (customer_id, caller_number)
);

CREATE TABLE inbound_conversation_calls (
  call_id TEXT PRIMARY KEY REFERENCES live_calls(call_id),
  conversation_id TEXT NOT NULL REFERENCES inbound_conversations(id),
  created_at INTEGER NOT NULL
);

CREATE INDEX inbound_conversation_calls_conversation ON inbound_conversation_calls(conversation_id, created_at);

CREATE TABLE live_call_transcripts (
  call_id TEXT NOT NULL REFERENCES live_calls(call_id),
  event_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('business', 'agent')),
  text TEXT NOT NULL,
  start_ms INTEGER NOT NULL,
  end_ms INTEGER NOT NULL,
  PRIMARY KEY (call_id, event_id)
);
