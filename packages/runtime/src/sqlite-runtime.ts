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
  PostgresCommitReadRow
} from "../../platform/src/persistence-types";
import type { AgentSessionTrace, CommitInfo } from "../../schema/src/types";
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
      this.writeFailures.push(`sqlite_events: ${String(error)}`);
    });
    const traceWrite = this.sessionTraceWriter.writeTrace(trace).catch((error: unknown) => {
      this.writeFailures.push(`sqlite_traces: ${String(error)}`);
    });
    const sessionWrite = this.postgresWriter.writeTrace(trace).catch((error: unknown) => {
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
    return {
      ...trace,
      timeline,
      git: { ...trace.git, commits }
    };
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
}

export interface SqliteRuntimeHandle {
  readonly runtime: InMemoryRuntime;
  readonly sqlite: SqliteClient;
  readonly hydratedCount: number;
  close(): Promise<void>;
}

export function createSqliteBackedRuntime(options: SqliteRuntimeOptions): SqliteRuntimeHandle {
  const sqlite = new SqliteClient(options.dbPath);
  const persistence = new SqlitePersistence(sqlite);
  const dailyCostReader = new SqliteDailyCostReader(sqlite);

  const runtime = createInMemoryRuntime({
    ...(options.startedAtMs !== undefined ? { startedAtMs: options.startedAtMs } : {}),
    persistence,
    dailyCostReader
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
