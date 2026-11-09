CREATE TABLE inbound_chat_messages (
  conversation_id TEXT NOT NULL REFERENCES inbound_conversations(id),
  message_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  text TEXT NOT NULL,
  PRIMARY KEY (conversation_id, message_id)
);
