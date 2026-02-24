import type { TimelineEvent } from "../../schema/src/types";
import type { ClickHouseAgentEventReadRow, ClickHouseQueryClient } from "./persistence-types";

const DEFAULT_TABLE_NAME = "agent_events";
const DEFAULT_LIMIT = 2000;

const EVENT_SELECT_COLUMNS = [
  "event_id",
  "event_type",
  "event_timestamp",
  "session_id",
  "prompt_id",
  "tool_success",
  "tool_name",
  "cost_usd",
  "input_tokens",
  "output_tokens",
  "attributes"
].join(", ");

function normalizeLimit(limit: number | undefined): number {
  if (typeof limit !== "number" || !Number.isFinite(limit)) {
    return DEFAULT_LIMIT;
  }
  const normalized = Math.trunc(limit);
  if (normalized <= 0) {
    return DEFAULT_LIMIT;
  }
  return normalized;
}

function escapeSqlString(value: string): string {
  return value.replaceAll("'", "''");
}

function toNumber(value: number | string | null): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return undefined;
}

function normalizeTimestamp(value: string): string {
  if (value.includes("T")) {
    return value;
  }
  const normalized = value.trim();
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(\.\d{1,6})?$/.test(normalized)) {
    return `${normalized.replace(" ", "T")}Z`;
  }
  return value;
}

function readRawEventId(attributes: Readonly<Record<string, string>>): string | undefined {
  const raw = attributes["event_id_raw"];
  if (typeof raw === "string" && raw.length > 0) {
    return raw;
  }
  return undefined;
}

function readStatus(row: ClickHouseAgentEventReadRow): string | undefined {
  if (row.tool_success === 1) {
    return "success";
  }
  if (row.tool_success === 0) {
    return "error";
  }
  if (row.event_type.toLowerCase().includes("error")) {
    return "error";
  }
  return undefined;
}

export function toTimelineEventFromClickHouseRow(row: ClickHouseAgentEventReadRow): TimelineEvent {
  const id = readRawEventId(row.attributes) ?? row.event_id;
  const costUsd = toNumber(row.cost_usd);
  const inputTokens = toNumber(row.input_tokens);
  const outputTokens = toNumber(row.output_tokens);
  const status = readStatus(row);

  const details: Record<string, unknown> = {};
  if (row.tool_name !== null) {
    details["toolName"] = row.tool_name;
  }
  const hookName = row.attributes["hook_name"];
  if (hookName !== undefined) {
    details["hookName"] = hookName;
  }
  const sourceVersion = row.attributes["source_version"];
  if (sourceVersion !== undefined) {
    details["sourceVersion"] = sourceVersion;
  }

  return {
    id,
    type: row.event_type,
    timestamp: normalizeTimestamp(row.event_timestamp),
    ...(row.prompt_id !== null ? { promptId: row.prompt_id } : {}),
    ...(status !== undefined ? { status } : {}),
    ...(costUsd !== undefined ? { costUsd } : {}),
    ...(inputTokens !== undefined && outputTokens !== undefined
      ? {
          tokens: {
            input: inputTokens,
            output: outputTokens
          }
        }
      : {}),
    ...(Object.keys(details).length > 0 ? { details } : {})
  };
}

export interface ClickHouseEventReaderOptions {
  readonly tableName?: string;
}

export class ClickHouseEventReader {
  private readonly client: ClickHouseQueryClient;
  private readonly tableName: string;

  public constructor(client: ClickHouseQueryClient, options: ClickHouseEventReaderOptions = {}) {
    this.client = client;
    this.tableName = options.tableName ?? DEFAULT_TABLE_NAME;
  }

  public async listTimelineBySessionId(sessionId: string, limit?: number): Promise<readonly TimelineEvent[]> {
    const escapedSessionId = escapeSqlString(sessionId);
    const normalizedLimit = normalizeLimit(limit);
    const query = [
      `SELECT ${EVENT_SELECT_COLUMNS}`,
      `FROM ${this.tableName}`,
      `WHERE session_id = '${escapedSessionId}'`,
      "ORDER BY event_timestamp ASC",
      `LIMIT ${String(normalizedLimit)}`
    ].join(" ");
    const rows = await this.client.queryJsonEachRow<ClickHouseAgentEventReadRow>(query);
    return rows.map((row) => toTimelineEventFromClickHouseRow(row));
  }
}
