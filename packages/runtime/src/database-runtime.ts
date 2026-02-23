import {
  createClickHouseSdkInsertClient,
  createPostgresPgPersistenceClient
} from "../../platform/src/database-adapters";
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
    postgresSessionClient: postgresClient
  });

  const runtime = createInMemoryRuntime({
    ...(options.startedAtMs !== undefined ? { startedAtMs: options.startedAtMs } : {}),
    persistence
  });

  return {
    runtime,
    close: async (): Promise<void> => {
      await closeClients(clickHouseClient, postgresClient);
    }
  };
}
