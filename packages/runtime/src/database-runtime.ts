import {
  createClickHouseSdkInsertClient,
  createPostgresPgPersistenceClient
} from "../../platform/src/database-adapters";
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

async function hydrateRuntimeFromClickHouse(
  runtime: InMemoryRuntime,
  clickHouseClient: RuntimeClosableClickHouseClient,
  limit: number | undefined
): Promise<number> {
  const reader = new ClickHouseSessionTraceReader(clickHouseClient);
  const traces = await reader.listLatest(limit);
  traces.forEach((trace) => {
    runtime.sessionRepository.upsert(trace);
  });
  return traces.length;
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

  const runtime = createInMemoryRuntime({
    ...(options.startedAtMs !== undefined ? { startedAtMs: options.startedAtMs } : {}),
    persistence
  });
  const hydratedSessionTraces =
    options.hydrateFromClickHouse === false
      ? Promise.resolve(0)
      : hydrateRuntimeFromClickHouse(runtime, clickHouseClient, options.bootstrapSessionTraceLimit).catch(
          () => 0
        );

  return {
    runtime,
    hydratedSessionTraces,
    close: async (): Promise<void> => {
      await closeClients(clickHouseClient, postgresClient);
    }
  };
}
