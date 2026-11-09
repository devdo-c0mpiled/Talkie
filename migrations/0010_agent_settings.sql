CREATE TABLE agent_settings (
  customer_no INTEGER PRIMARY KEY REFERENCES customers(customer_no) ON DELETE RESTRICT,
  language TEXT,
  voice TEXT NOT NULL,
  response_rules TEXT NOT NULL
);
