import {
  createClickHouseSdkInsertClient,
  createPostgresPgPersistenceClient
} from "../../platform/src/database-adapters";
import { ClickHouseDailyCostReader } from "../../platform/src/clickhouse-daily-cost-reader";
import { ClickHouseEventReader } from "../../platform/src/clickhouse-event-reader";
import { ClickHouseSessionTraceReader } from "../../platform/src/clickhouse-session-trace-reader";
import type { ClickHouseInsertClient, ClickHouseSessionTraceRow } from "../../platform/src/persistence-types";
import { createWriterBackedRuntimePersistence } from "./persistence";
import { createInMemoryRuntime, type InMemoryRuntime } from "./runtime";
import type {
  DatabaseBackedRuntime,
  DatabaseBackedRuntimeOptions,
  RuntimeClosableClickHouseClient,
  RuntimeClosablePostgresClient,
  RuntimeDatabaseClientFactories
} from "./types";

const defaultFactories: RuntimeDatabaseClientFactories = {
  createClickHouseClient: (options): RuntimeClosableClickHouseClient => createClickHouseSdkInsertClient(options),
  createPostgresClient: (options): RuntimeClosablePostgresClient => createPostgresPgPersistenceClient(options)
};

function normalizeSyncIntervalMs(input: number | undefined): number {
  if (typeof input !== "number" || !Number.isFinite(input)) {
    return 5000;
  }
  const normalized = Math.trunc(input);
  if (normalized < 500) {
    return 500;
  }
  return normalized;
}

async function hydrateRuntimeFromClickHouse(
  runtime: InMemoryRuntime,
  clickHouseClient: RuntimeClosableClickHouseClient,
  postgresClient: RuntimeClosablePostgresClient | undefined,
  limit: number | undefined,
  timelineEventLimit: number | undefined
): Promise<number> {
  const reader = new ClickHouseSessionTraceReader(clickHouseClient);
  const eventReader = new ClickHouseEventReader(clickHouseClient);
  const traces = await reader.listLatest(limit);
  const hydratedTraces = await Promise.all(
    traces.map(async (trace) => {
      const timeline = await eventReader.listTimelineBySessionId(trace.sessionId, timelineEventLimit);
      let commits = trace.git.commits;
      const hasRealCommits = commits.length > 0 && !commits.every((c) => c.sha.startsWith("placeholder_"));
      if (postgresClient?.listCommitsBySessionId !== undefined && !hasRealCommits) {
        try {
          const rows = await postgresClient.listCommitsBySessionId(trace.sessionId);
          commits = rows.map((row) => ({
            sha: row.sha,
            ...(row.prompt_id !== null ? { promptId: row.prompt_id } : {}),
            ...(row.message !== null ? { message: row.message } : {}),
            ...(row.committed_at !== null ? { committedAt: row.committed_at } : {})
          }));
        } catch {
          // commit enrichment is best-effort
        }
      }
      return {
        ...trace,
        timeline,
        git: {
          ...trace.git,
          commits
        }
      };
    })
  );
  hydratedTraces.forEach((trace) => {
    runtime.sessionRepository.upsert(trace);
  });
  return hydratedTraces.length;
}

async function closeClients(
  clickHouseClient: RuntimeClosableClickHouseClient,
  postgresClient: RuntimeClosablePostgresClient
): Promise<void> {
  let firstError: unknown;

  try {
    await clickHouseClient.close();
  } catch (error: unknown) {
    firstError = error;
  }

  try {
    await postgresClient.close();
  } catch (error: unknown) {
    if (firstError === undefined) {
      firstError = error;
    }
  }

  if (firstError !== undefined) {
    throw firstError;
  }
}

export function createDatabaseBackedRuntime(
  options: DatabaseBackedRuntimeOptions
): DatabaseBackedRuntime<InMemoryRuntime> {
  const factories = options.factories ?? defaultFactories;
  const clickHouseClient = factories.createClickHouseClient(options.clickHouse);
  const postgresClient = factories.createPostgresClient(options.postgres);

  const persistence = createWriterBackedRuntimePersistence({
    clickHouseClient,
    clickHouseSessionTraceClient:
      clickHouseClient as unknown as ClickHouseInsertClient<ClickHouseSessionTraceRow>,
    postgresSessionClient: postgresClient
  });

  const dailyCostReader = new ClickHouseDailyCostReader(clickHouseClient);

  const runtime = createInMemoryRuntime({
    ...(options.startedAtMs !== undefined ? { startedAtMs: options.startedAtMs } : {}),
    persistence,
    dailyCostReader
  });
  const hydrationEnabled = options.hydrateFromClickHouse !== false;
  const syncIntervalMs = normalizeSyncIntervalMs(options.sessionTraceSyncIntervalMs);
  let syncInFlight = false;
  const syncSessionTraces = async (): Promise<number> => {
    if (!hydrationEnabled || syncInFlight) {
      return 0;
    }

    syncInFlight = true;
    try {
      return await hydrateRuntimeFromClickHouse(
        runtime,
        clickHouseClient,
        postgresClient,
        options.bootstrapSessionTraceLimit,
        options.sessionTimelineEventLimit
      );
    } catch {
      return 0;
    } finally {
      syncInFlight = false;
    }
  };

  const hydratedSessionTraces = syncSessionTraces();
  const syncInterval = hydrationEnabled
    ? setInterval(() => {
        void syncSessionTraces();
      }, syncIntervalMs)
    : undefined;

  return {
    runtime,
    hydratedSessionTraces,
    close: async (): Promise<void> => {
      if (syncInterval !== undefined) {
        clearInterval(syncInterval);
      }
      await closeClients(clickHouseClient, postgresClient);
    }
  };
}
