CREATE TABLE IF NOT EXISTS instance_settings
(
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ingestion_dedupe
(
  event_id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  checksum TEXT,
  seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

