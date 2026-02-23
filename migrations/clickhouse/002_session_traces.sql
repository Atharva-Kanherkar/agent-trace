CREATE TABLE IF NOT EXISTS session_traces
(
  session_id String,
  version UInt64,
  started_at DateTime64(3, 'UTC'),
  ended_at Nullable(DateTime64(3, 'UTC')),
  user_id String,
  git_repo Nullable(String),
  git_branch Nullable(String),
  prompt_count UInt32,
  tool_call_count UInt32,
  api_call_count UInt32,
  total_cost_usd Decimal64(10),
  total_input_tokens UInt64,
  total_output_tokens UInt64,
  lines_added Int64,
  lines_removed Int64,
  models_used Array(String),
  tools_used Array(String),
  files_touched Array(String),
  updated_at DateTime64(3, 'UTC')
)
ENGINE = ReplacingMergeTree(version)
ORDER BY (session_id);

