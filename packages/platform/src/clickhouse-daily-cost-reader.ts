import type { ClickHouseQueryClient } from "./persistence-types";

export interface ClickHouseDailyCostRow {
  readonly metric_date: string;
  readonly sessions_count: number | string;
  readonly total_cost_usd: number | string;
  readonly total_input_tokens: number | string;
  readonly total_output_tokens: number | string;
}

export interface DailyCostPoint {
  readonly date: string;
  readonly totalCostUsd: number;
  readonly sessionCount: number;
  readonly promptCount: number;
  readonly toolCallCount: number;
}

function toFiniteNumber(value: number | string | null | undefined): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return 0;
}

function normalizeDate(value: string): string {
  return value.slice(0, 10);
}

const DAILY_COST_SELECT = [
  "metric_date",
  "sum(sessions_count) AS sessions_count",
  "sum(total_cost_usd) AS total_cost_usd",
  "sum(total_input_tokens) AS total_input_tokens",
  "sum(total_output_tokens) AS total_output_tokens"
].join(", ");

export class ClickHouseDailyCostReader {
  private readonly client: ClickHouseQueryClient;
  private readonly tableName: string;

  public constructor(client: ClickHouseQueryClient, tableName = "daily_user_metrics") {
    this.client = client;
    this.tableName = tableName;
  }

  public async listDailyCosts(limit = 30): Promise<readonly DailyCostPoint[]> {
    const query = [
      `SELECT ${DAILY_COST_SELECT}`,
      `FROM ${this.tableName}`,
      "GROUP BY metric_date",
      "ORDER BY metric_date ASC",
      `LIMIT ${String(Math.max(1, Math.trunc(limit)))}`
    ].join(" ");

    const rows = await this.client.queryJsonEachRow<ClickHouseDailyCostRow>(query);
    return rows.map((row) => ({
      date: normalizeDate(row.metric_date),
      totalCostUsd: Number(toFiniteNumber(row.total_cost_usd).toFixed(6)),
      sessionCount: Math.trunc(toFiniteNumber(row.sessions_count)),
      promptCount: 0,
      toolCallCount: 0
    }));
  }
}
