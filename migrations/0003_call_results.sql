-- What a call Tokie placed for a traveler ended in: the booking details and the transcript,
-- shown on the page the chat links to (/b/<id>). `data` is the StoredCallResult JSON.
CREATE TABLE call_results (
  id TEXT PRIMARY KEY,
  call_id TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL,
  data TEXT NOT NULL
);
