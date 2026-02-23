CREATE TABLE IF NOT EXISTS agent_events
(
  event_id UUID,
  event_type LowCardinality(String),
  event_timestamp DateTime64(3, 'UTC'),
  session_id String,
  prompt_id Nullable(String),
  user_id String,
  source LowCardinality(String),
  agent_type LowCardinality(String),
  tool_name Nullable(LowCardinality(String)),
  tool_success Nullable(UInt8),
  tool_duration_ms Nullable(Int64),
  model Nullable(LowCardinality(String)),
  cost_usd Nullable(Decimal64(10)),
  input_tokens Nullable(Int64),
  output_tokens Nullable(Int64),
  api_duration_ms Nullable(Int64),
  lines_added Nullable(Int64),
  lines_removed Nullable(Int64),
  files_changed Array(String),
  commit_sha Nullable(String),
  attributes Map(LowCardinality(String), String)
)
ENGINE = MergeTree()
PARTITION BY toYYYYMM(event_timestamp)
ORDER BY (session_id, event_timestamp, event_id);

