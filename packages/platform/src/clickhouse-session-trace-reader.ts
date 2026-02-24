import type { AgentSessionTrace } from "../../schema/src/types";
import type {
  ClickHouseQueryClient,
  ClickHouseSessionTraceRow
} from "./persistence-types";

const DEFAULT_TABLE_NAME = "session_traces";
const DEFAULT_LIMIT = 200;

const SESSION_TRACE_SELECT_COLUMNS = [
  "session_id",
  "version",
  "started_at",
  "ended_at",
  "user_id",
  "git_repo",
  "git_branch",
  "prompt_count",
  "tool_call_count",
  "api_call_count",
  "total_cost_usd",
  "total_input_tokens",
  "total_output_tokens",
  "lines_added",
  "lines_removed",
  "models_used",
  "tools_used",
  "files_touched",
  "commit_count",
  "updated_at"
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

function toNonNegativeInteger(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  const normalized = Math.trunc(value);
  if (normalized < 0) {
    return 0;
  }
  return normalized;
}

function toUniqueStrings(values: readonly string[]): readonly string[] {
  const seen = new Set<string>();
  const output: string[] = [];
  values.forEach((value) => {
    if (value.length === 0 || seen.has(value)) {
      return;
    }
    seen.add(value);
    output.push(value);
  });
  return output;
}

function toActiveDurationMs(startedAt: string, endedAt: string | null): number {
  if (endedAt === null) {
    return 0;
  }

  const started = Date.parse(startedAt);
  const ended = Date.parse(endedAt);
  if (Number.isNaN(started) || Number.isNaN(ended)) {
    return 0;
  }

  return Math.max(0, ended - started);
}

function buildPlaceholderCommits(count: number): readonly { readonly sha: string }[] {
  if (count <= 0) return [];
  const result: { readonly sha: string }[] = [];
  for (let i = 0; i < count; i++) {
    result.push({ sha: `placeholder_${String(i)}` });
  }
  return result;
}

function escapeSqlString(value: string): string {
  return value.replaceAll("'", "''");
}

export function toAgentSessionTraceFromClickHouseRow(
  row: ClickHouseSessionTraceRow
): AgentSessionTrace {
  return {
    sessionId: row.session_id,
    agentType: "claude_code",
    user: {
      id: row.user_id
    },
    environment: {
      ...(row.git_repo !== null ? { gitRepo: row.git_repo } : {}),
      ...(row.git_branch !== null ? { gitBranch: row.git_branch } : {})
    },
    startedAt: row.started_at,
    ...(row.ended_at !== null ? { endedAt: row.ended_at } : {}),
    activeDurationMs: toActiveDurationMs(row.started_at, row.ended_at),
    timeline: [],
    metrics: {
      promptCount: toNonNegativeInteger(row.prompt_count),
      apiCallCount: toNonNegativeInteger(row.api_call_count),
      toolCallCount: toNonNegativeInteger(row.tool_call_count),
      totalCostUsd: Number.isFinite(row.total_cost_usd) ? row.total_cost_usd : 0,
      totalInputTokens: toNonNegativeInteger(row.total_input_tokens),
      totalOutputTokens: toNonNegativeInteger(row.total_output_tokens),
      linesAdded: Math.trunc(row.lines_added),
      linesRemoved: Math.trunc(row.lines_removed),
      filesTouched: toUniqueStrings(row.files_touched),
      modelsUsed: toUniqueStrings(row.models_used),
      toolsUsed: toUniqueStrings(row.tools_used)
    },
    git: {
      commits: buildPlaceholderCommits(toNonNegativeInteger(row.commit_count)),
      pullRequests: []
    }
  };
}

export interface ClickHouseSessionTraceReaderOptions {
  readonly tableName?: string;
}

export class ClickHouseSessionTraceReader {
  private readonly client: ClickHouseQueryClient;
  private readonly tableName: string;

  public constructor(client: ClickHouseQueryClient, options: ClickHouseSessionTraceReaderOptions = {}) {
    this.client = client;
    this.tableName = options.tableName ?? DEFAULT_TABLE_NAME;
  }

  public async listLatest(limit?: number): Promise<readonly AgentSessionTrace[]> {
    const normalizedLimit = normalizeLimit(limit);
    const query = [
      `SELECT ${SESSION_TRACE_SELECT_COLUMNS}`,
      `FROM ${this.tableName}`,
      "FINAL",
      "ORDER BY updated_at DESC",
      `LIMIT ${String(normalizedLimit)}`
    ].join(" ");
    const rows = await this.client.queryJsonEachRow<ClickHouseSessionTraceRow>(query);
    return rows.map((row) => toAgentSessionTraceFromClickHouseRow(row));
  }

  public async getBySessionId(sessionId: string): Promise<AgentSessionTrace | undefined> {
    const escapedSessionId = escapeSqlString(sessionId);
    const query = [
      `SELECT ${SESSION_TRACE_SELECT_COLUMNS}`,
      `FROM ${this.tableName}`,
      "FINAL",
      `WHERE session_id = '${escapedSessionId}'`,
      "ORDER BY version DESC",
      "LIMIT 1"
    ].join(" ");
    const rows = await this.client.queryJsonEachRow<ClickHouseSessionTraceRow>(query);
    const row = rows[0];
    if (row === undefined) {
      return undefined;
    }
    return toAgentSessionTraceFromClickHouseRow(row);
  }
}
