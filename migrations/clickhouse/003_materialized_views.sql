CREATE TABLE IF NOT EXISTS daily_user_metrics
(
  metric_date Date,
  user_id String,
  sessions_count UInt64,
  total_cost_usd Decimal64(10),
  total_input_tokens UInt64,
  total_output_tokens UInt64
)
ENGINE = SummingMergeTree()
ORDER BY (metric_date, user_id);

CREATE MATERIALIZED VIEW IF NOT EXISTS mv_daily_user_metrics
TO daily_user_metrics
AS
SELECT
  toDate(event_timestamp) AS metric_date,
  user_id,
  countDistinct(session_id) AS sessions_count,
  sumIf(cost_usd, cost_usd IS NOT NULL) AS total_cost_usd,
  sumIf(input_tokens, input_tokens IS NOT NULL) AS total_input_tokens,
  sumIf(output_tokens, output_tokens IS NOT NULL) AS total_output_tokens
FROM agent_events
GROUP BY metric_date, user_id;

CREATE TABLE IF NOT EXISTS tool_usage_daily
(
  metric_date Date,
  user_id String,
  tool_name String,
  tool_calls UInt64,
  tool_success_calls UInt64,
  tool_fail_calls UInt64,
  total_tool_duration_ms Int64
)
ENGINE = SummingMergeTree()
ORDER BY (metric_date, user_id, tool_name);

CREATE MATERIALIZED VIEW IF NOT EXISTS mv_tool_usage_daily
TO tool_usage_daily
AS
SELECT
  toDate(event_timestamp) AS metric_date,
  user_id,
  ifNull(tool_name, 'unknown') AS tool_name,
  count() AS tool_calls,
  sumIf(toUInt64(1), tool_success = 1) AS tool_success_calls,
  sumIf(toUInt64(1), tool_success = 0) AS tool_fail_calls,
  sumIf(tool_duration_ms, tool_duration_ms IS NOT NULL) AS total_tool_duration_ms
FROM agent_events
WHERE event_type = 'tool_result' AND tool_name IS NOT NULL
GROUP BY metric_date, user_id, tool_name;

CREATE TABLE IF NOT EXISTS model_cost_daily
(
  metric_date Date,
  user_id String,
  model String,
  api_calls UInt64,
  total_cost_usd Decimal64(10),
  total_input_tokens UInt64,
  total_output_tokens UInt64,
  total_api_duration_ms Int64
)
ENGINE = SummingMergeTree()
ORDER BY (metric_date, user_id, model);

CREATE MATERIALIZED VIEW IF NOT EXISTS mv_model_cost_daily
TO model_cost_daily
AS
SELECT
  toDate(event_timestamp) AS metric_date,
  user_id,
  ifNull(model, 'unknown') AS model,
  count() AS api_calls,
  sumIf(cost_usd, cost_usd IS NOT NULL) AS total_cost_usd,
  sumIf(input_tokens, input_tokens IS NOT NULL) AS total_input_tokens,
  sumIf(output_tokens, output_tokens IS NOT NULL) AS total_output_tokens,
  sumIf(api_duration_ms, api_duration_ms IS NOT NULL) AS total_api_duration_ms
FROM agent_events
WHERE model IS NOT NULL
GROUP BY metric_date, user_id, model;
