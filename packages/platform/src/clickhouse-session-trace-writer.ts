import type { AgentSessionTrace } from "../../schema/src/types";
import type {
  ClickHouseInsertClient,
  ClickHouseSessionTraceRow,
  ClickHouseSessionTraceWriterOptions,
  ClickHouseWriteSummary
} from "./persistence-types";
import { toClickHouseDateTime64 } from "./clickhouse-datetime";

const DEFAULT_TABLE_NAME = "session_traces";

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

function toUniqueStringArray(values: readonly string[]): readonly string[] {
  const seen = new Set<string>();
  const output: string[] = [];

  values.forEach((value) => {
    if (value.length === 0) {
      return;
    }
    if (seen.has(value)) {
      return;
    }
    seen.add(value);
    output.push(value);
  });

  return output;
}

function normalizeVersion(rawVersion: number): number {
  if (!Number.isFinite(rawVersion)) {
    return 1;
  }
  const version = Math.trunc(rawVersion);
  if (version < 1) {
    return 1;
  }
  return version;
}

export function toClickHouseSessionTraceRow(
  trace: AgentSessionTrace,
  version: number,
  updatedAt: string
): ClickHouseSessionTraceRow {
  return {
    session_id: trace.sessionId,
    version: normalizeVersion(version),
    started_at: toClickHouseDateTime64(trace.startedAt),
    ended_at: trace.endedAt === undefined ? null : toClickHouseDateTime64(trace.endedAt),
    user_id: trace.user.id,
    git_repo: trace.environment.gitRepo ?? null,
    git_branch: trace.environment.gitBranch ?? null,
    prompt_count: toNonNegativeInteger(trace.metrics.promptCount),
    tool_call_count: toNonNegativeInteger(trace.metrics.toolCallCount),
    api_call_count: toNonNegativeInteger(trace.metrics.apiCallCount),
    total_cost_usd: Number.isFinite(trace.metrics.totalCostUsd) ? trace.metrics.totalCostUsd : 0,
    total_input_tokens: toNonNegativeInteger(trace.metrics.totalInputTokens),
    total_output_tokens: toNonNegativeInteger(trace.metrics.totalOutputTokens),
    lines_added: Math.trunc(trace.metrics.linesAdded),
    lines_removed: Math.trunc(trace.metrics.linesRemoved),
    models_used: toUniqueStringArray(trace.metrics.modelsUsed),
    tools_used: toUniqueStringArray(trace.metrics.toolsUsed),
    files_touched: toUniqueStringArray(trace.metrics.filesTouched),
    commit_count: toNonNegativeInteger(trace.git.commits.length),
    updated_at: toClickHouseDateTime64(updatedAt)
  };
}

export class ClickHouseSessionTraceWriter {
  private readonly tableName: string;
  private readonly client: ClickHouseInsertClient<ClickHouseSessionTraceRow>;
  private readonly versionProvider: () => number;
  private readonly updatedAtProvider: () => string;

  public constructor(
    client: ClickHouseInsertClient<ClickHouseSessionTraceRow>,
    options: ClickHouseSessionTraceWriterOptions = {}
  ) {
    this.client = client;
    this.tableName = options.tableName ?? DEFAULT_TABLE_NAME;
    this.versionProvider = options.versionProvider ?? (() => Date.now());
    this.updatedAtProvider = options.updatedAtProvider ?? (() => new Date().toISOString());
  }

  public async writeTrace(trace: AgentSessionTrace): Promise<ClickHouseWriteSummary> {
    return this.writeTraces([trace]);
  }

  public async writeTraces(traces: readonly AgentSessionTrace[]): Promise<ClickHouseWriteSummary> {
    if (traces.length === 0) {
      return {
        tableName: this.tableName,
        writtenRows: 0
      };
    }

    const baseVersion = normalizeVersion(this.versionProvider());
    const updatedAt = this.updatedAtProvider();
    const rows = traces.map((trace, index) =>
      toClickHouseSessionTraceRow(trace, baseVersion + index, updatedAt)
    );

    await this.client.insertJsonEachRow({
      table: this.tableName,
      rows
    });

    return {
      tableName: this.tableName,
      writtenRows: rows.length
    };
  }
}
