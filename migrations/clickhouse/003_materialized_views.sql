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

