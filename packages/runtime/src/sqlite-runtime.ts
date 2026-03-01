import { SqliteClient } from "../../platform/src/sqlite-client";
import { ClickHouseEventWriter } from "../../platform/src/clickhouse-event-writer";
import { ClickHouseSessionTraceWriter } from "../../platform/src/clickhouse-session-trace-writer";
import { PostgresSessionWriter } from "../../platform/src/postgres-writer";
import { toAgentSessionTraceFromClickHouseRow } from "../../platform/src/clickhouse-session-trace-reader";
import { toTimelineEventFromClickHouseRow } from "../../platform/src/clickhouse-event-reader";
import type {
  ClickHouseAgentEventReadRow,
  ClickHouseSessionTraceRow,
  ClickHouseInsertRequest,
  PostgresCommitReadRow,
  PostgresPullRequestRow
} from "../../platform/src/persistence-types";
import type { AgentSessionTrace, CommitInfo, PullRequestInfo } from "../../schema/src/types";
import type { InsightsConfig, InsightsProvider, TeamInsightsContext } from "../../schema/src/insights-types";
import type { ApiInsightsConfigAccessor } from "../../api/src/types";
import { calculateCostUsd } from "../../schema/src/pricing";
import { createInMemoryRuntime, type InMemoryRuntime } from "./runtime";
import type { RuntimePersistence, RuntimePersistenceSnapshot, RuntimeEnvelope, RuntimeDailyCostReader } from "./types";

class SqliteSessionTraceInsertAdapter {
  private readonly sqlite: SqliteClient;

  public constructor(sqlite: SqliteClient) {
    this.sqlite = sqlite;
  }

  public async insertJsonEachRow(request: ClickHouseInsertRequest<ClickHouseSessionTraceRow>): Promise<void> {
    this.sqlite.insertSessionTraces(request.rows);
  }
}

class SqlitePersistence implements RuntimePersistence {
  private readonly eventWriter: ClickHouseEventWriter;
  private readonly sessionTraceWriter: ClickHouseSessionTraceWriter;
  private readonly postgresWriter: PostgresSessionWriter;
  private readonly writeFailures: string[] = [];

  public constructor(sqlite: SqliteClient) {
    this.eventWriter = new ClickHouseEventWriter(sqlite);
    this.sessionTraceWriter = new ClickHouseSessionTraceWriter(new SqliteSessionTraceInsertAdapter(sqlite));
    this.postgresWriter = new PostgresSessionWriter(sqlite);
  }

  public async persistAcceptedEvent(event: RuntimeEnvelope, trace: AgentSessionTrace): Promise<void> {
    const eventWrite = this.eventWriter.writeEvent(event).catch((error: unknown) => {
      console.error(`[agent-trace] sqlite_events write failed: ${String(error)}`);
      this.writeFailures.push(`sqlite_events: ${String(error)}`);
    });
    const traceWrite = this.sessionTraceWriter.writeTrace(trace).catch((error: unknown) => {
      console.error(`[agent-trace] sqlite_traces write failed: ${String(error)}`);
      this.writeFailures.push(`sqlite_traces: ${String(error)}`);
    });
    const sessionWrite = this.postgresWriter.writeTrace(trace).catch((error: unknown) => {
      console.error(`[agent-trace] sqlite_sessions write failed: ${String(error)}`);
      this.writeFailures.push(`sqlite_sessions: ${String(error)}`);
    });

    await Promise.all([eventWrite, traceWrite, sessionWrite]);
  }

  public getSnapshot(): RuntimePersistenceSnapshot {
    return {
      clickHouseRows: [],
      clickHouseSessionTraceRows: [],
      postgresSessionRows: [],
      postgresCommitRows: [],
      writeFailures: [...this.writeFailures]
    };
  }
}

class SqliteDailyCostReader implements RuntimeDailyCostReader {
  private readonly sqlite: SqliteClient;

  public constructor(sqlite: SqliteClient) {
    this.sqlite = sqlite;
  }

  public async listDailyCosts(limit?: number): Promise<readonly { date: string; totalCostUsd: number; sessionCount: number; promptCount: number; toolCallCount: number }[]> {
    const rows = this.sqlite.listDailyCosts(limit);
    return rows.map((r: { date: string; totalCostUsd: number; sessionCount: number }) => ({
      date: r.date,
      totalCostUsd: r.totalCostUsd,
      sessionCount: r.sessionCount,
      promptCount: 0,
      toolCallCount: 0
    }));
  }
}

function hydrateFromSqlite(runtime: InMemoryRuntime, sqlite: SqliteClient, limit?: number, eventLimit?: number): number {
  const traceRows = sqlite.listSessionTraces(limit);
  const traces: AgentSessionTrace[] = traceRows.map((row: ClickHouseSessionTraceRow) => {
    const trace = toAgentSessionTraceFromClickHouseRow(row);
    const eventRows = sqlite.listEventsBySessionId(row.session_id, eventLimit);
    const timeline = eventRows.map((e: ClickHouseAgentEventReadRow) => toTimelineEventFromClickHouseRow(e));
    let commits: readonly CommitInfo[] = trace.git.commits.filter((c: CommitInfo) => !c.sha.startsWith("placeholder_"));
    const pgCommits = sqlite.listCommitsBySessionId(row.session_id);
    if (pgCommits.length > 0) {
      const mapped = pgCommits.map((c: PostgresCommitReadRow) => ({
        sha: c.sha,
        ...(c.prompt_id !== null ? { promptId: c.prompt_id } : {}),
        ...(c.message !== null ? { message: c.message } : {}),
        ...(c.lines_added > 0 ? { linesAdded: c.lines_added } : {}),
        ...(c.lines_removed > 0 ? { linesRemoved: c.lines_removed } : {}),
        ...(c.committed_at !== null ? { committedAt: c.committed_at } : {})
      }));
      const pgShas = new Set(mapped.map((c: { sha: string }) => c.sha));
      const extra = commits.filter((c: CommitInfo) => !pgShas.has(c.sha));
      commits = [...mapped, ...extra];
    }
    let pullRequests: readonly PullRequestInfo[] = trace.git.pullRequests;
    const pgPrs = sqlite.listPullRequestsBySessionId(row.session_id);
    if (pgPrs.length > 0) {
      pullRequests = pgPrs.map((pr: PostgresPullRequestRow) => ({
        repo: pr.repo,
        prNumber: pr.pr_number,
        state: pr.state,
        ...(pr.url !== null ? { url: pr.url } : {}),
        ...(pr.merged_at !== null ? { mergedAt: pr.merged_at } : {})
      }));
    }

    let hydratedTrace: AgentSessionTrace = {
      ...trace,
      timeline,
      git: { ...trace.git, commits, pullRequests }
    };

    // Recalculate cost from tokens if stored cost is 0 but tokens exist
    if (
      hydratedTrace.metrics.totalCostUsd === 0 &&
      (hydratedTrace.metrics.totalInputTokens > 0 || hydratedTrace.metrics.totalOutputTokens > 0) &&
      hydratedTrace.metrics.modelsUsed.length > 0
    ) {
      const model: string = String(hydratedTrace.metrics.modelsUsed[0]);
      const recalculated = calculateCostUsd({
        model,
        inputTokens: hydratedTrace.metrics.totalInputTokens,
        outputTokens: hydratedTrace.metrics.totalOutputTokens,
        cacheReadTokens: hydratedTrace.metrics.totalCacheReadTokens,
        cacheWriteTokens: hydratedTrace.metrics.totalCacheWriteTokens
      });
      if (recalculated > 0) {
        hydratedTrace = {
          ...hydratedTrace,
          metrics: { ...hydratedTrace.metrics, totalCostUsd: recalculated }
        };
      }
    }

    return hydratedTrace;
  });

  for (const trace of traces) {
    runtime.sessionRepository.upsert(trace);
  }
  return traces.length;
}

export interface SqliteRuntimeOptions {
  readonly dbPath: string;
  readonly startedAtMs?: number;
  readonly syncIntervalMs?: number;
  readonly bootstrapLimit?: number;
  readonly eventLimit?: number;
  readonly insightsConfigAccessor?: import("../../api/src/types").ApiInsightsConfigAccessor;
}

export interface SqliteRuntimeHandle {
  readonly runtime: InMemoryRuntime;
  readonly sqlite: SqliteClient;
  readonly hydratedCount: number;
  close(): Promise<void>;
}

const VALID_INSIGHTS_PROVIDERS: readonly string[] = ["anthropic", "openai", "gemini", "openrouter"];

function createSqliteInsightsConfigAccessor(sqlite: SqliteClient): ApiInsightsConfigAccessor {
  let cached: InsightsConfig | undefined;
  let cachedContext: TeamInsightsContext | undefined;

  const raw = sqlite.getSetting("insights_config");
  if (raw !== undefined) {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
        const obj = parsed as Record<string, unknown>;
        if (typeof obj["provider"] === "string" && VALID_INSIGHTS_PROVIDERS.includes(obj["provider"]) && typeof obj["apiKey"] === "string") {
          cached = {
            provider: obj["provider"] as InsightsProvider,
            apiKey: obj["apiKey"],
            ...(typeof obj["model"] === "string" && obj["model"].length > 0 ? { model: obj["model"] } : {})
          };
        }
      }
    } catch {
      // ignore corrupt data
    }
  }

  const rawContext = sqlite.getSetting("team_insights_context");
  if (rawContext !== undefined) {
    try {
      const parsed: unknown = JSON.parse(rawContext);
      if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
        const obj = parsed as Record<string, unknown>;
        if (typeof obj["companyContext"] === "string" || typeof obj["analysisGuidelines"] === "string") {
          cachedContext = {
            companyContext: typeof obj["companyContext"] === "string" ? obj["companyContext"] : "",
            analysisGuidelines: typeof obj["analysisGuidelines"] === "string" ? obj["analysisGuidelines"] : "",
            updatedAt: typeof obj["updatedAt"] === "string" ? obj["updatedAt"] : new Date().toISOString()
          };
        }
      }
    } catch {
      // ignore corrupt data
    }
  }

  return {
    getConfig(): InsightsConfig | undefined {
      return cached;
    },
    setConfig(config: InsightsConfig): void {
      cached = config;
      sqlite.upsertSetting("insights_config", JSON.stringify(config));
    },
    getTeamInsightsContext(): TeamInsightsContext | undefined {
      return cachedContext;
    },
    setTeamInsightsContext(context: TeamInsightsContext): void {
      cachedContext = context;
      sqlite.upsertSetting("team_insights_context", JSON.stringify(context));
    }
  };
}

function createSqliteTeamBudgetStore(sqlite: SqliteClient): import("../../api/src/types").ApiTeamBudgetStore {
  return {
    getTeamBudget() {
      return sqlite.getTeamBudget() ?? undefined;
    },
    upsertTeamBudget(limitUsd: number, alertPercent: number) {
      sqlite.upsertTeamBudget(limitUsd, alertPercent);
    },
    getMonthSpend(yearMonth: string) {
      return sqlite.getMonthSpend(yearMonth);
    }
  };
}

export function createSqliteBackedRuntime(options: SqliteRuntimeOptions): SqliteRuntimeHandle {
  const sqlite = new SqliteClient(options.dbPath);
  const persistence = new SqlitePersistence(sqlite);
  const dailyCostReader = new SqliteDailyCostReader(sqlite);
  const insightsConfigAccessor = options.insightsConfigAccessor ?? createSqliteInsightsConfigAccessor(sqlite);
  const teamBudgetStore = createSqliteTeamBudgetStore(sqlite);

  const runtime = createInMemoryRuntime({
    ...(options.startedAtMs !== undefined ? { startedAtMs: options.startedAtMs } : {}),
    persistence,
    dailyCostReader,
    insightsConfigAccessor,
    teamBudgetStore
  });

  const hydratedCount = hydrateFromSqlite(runtime, sqlite, options.bootstrapLimit, options.eventLimit);

  const syncIntervalMs = options.syncIntervalMs ?? 5000;
  let syncInFlight = false;
  const syncInterval = setInterval(() => {
    if (syncInFlight) return;
    syncInFlight = true;
    try {
      hydrateFromSqlite(runtime, sqlite, options.bootstrapLimit, options.eventLimit);
    } finally {
      syncInFlight = false;
    }
  }, syncIntervalMs);

  return {
    runtime,
    sqlite,
    hydratedCount,
    close: async (): Promise<void> => {
      clearInterval(syncInterval);
      sqlite.close();
    }
  };
}
