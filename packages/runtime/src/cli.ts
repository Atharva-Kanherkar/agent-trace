#!/usr/bin/env node
import { createDatabaseBackedRuntime } from "./database-runtime";
import { parseRuntimeDatabaseConfigFromEnv } from "./env";
import { runRuntimeDatabaseMigrations } from "./migrations";
import { createInMemoryRuntime, startInMemoryRuntimeServers, type InMemoryRuntime } from "./runtime";
import type { RuntimeStartedServers } from "./types";

function readNumberEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined) {
    return fallback;
  }

  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

async function main(): Promise<void> {
  const host = process.env["RUNTIME_HOST"] ?? "127.0.0.1";
  const collectorPort = readNumberEnv("COLLECTOR_PORT", 8317);
  const apiPort = readNumberEnv("API_PORT", 8318);
  const startedAtMs = Date.now();

  const dbConfig = parseRuntimeDatabaseConfigFromEnv(process.env as Record<string, string | undefined>);
  let migrationSummary:
    | {
        readonly clickHouseStatements: number;
        readonly postgresStatements: number;
      }
    | undefined;
  let runtimeHandle:
    | { readonly mode: "in-memory"; readonly runtime: InMemoryRuntime; close(): Promise<void> }
    | { readonly mode: "db-backed"; readonly runtime: InMemoryRuntime; close(): Promise<void> };

  if (dbConfig === undefined) {
    runtimeHandle = {
      mode: "in-memory",
      runtime: createInMemoryRuntime({
        startedAtMs
      }),
      close: async (): Promise<void> => Promise.resolve()
    };
  } else {
    const migrationResult = await runRuntimeDatabaseMigrations(dbConfig);
    migrationSummary = {
      clickHouseStatements: migrationResult.clickHouse.executedStatements,
      postgresStatements: migrationResult.postgres.executedStatements
    };

    runtimeHandle = {
      mode: "db-backed",
      ...createDatabaseBackedRuntime({
        startedAtMs,
        clickHouse: dbConfig.clickHouse,
        postgres: dbConfig.postgres
      })
    };
  }

  let servers: RuntimeStartedServers;
  try {
    servers = await startInMemoryRuntimeServers(runtimeHandle.runtime, {
      host,
      collectorPort,
      apiPort
    });
  } catch (error: unknown) {
    await runtimeHandle.close();
    throw error;
  }

  process.stdout.write(`runtime started\n`);
  process.stdout.write(`mode=${runtimeHandle.mode}\n`);
  if (migrationSummary !== undefined) {
    process.stdout.write(`migrations.clickhouse.statements=${String(migrationSummary.clickHouseStatements)}\n`);
    process.stdout.write(`migrations.postgres.statements=${String(migrationSummary.postgresStatements)}\n`);
  }
  process.stdout.write(`collector=${servers.collectorAddress}\n`);
  process.stdout.write(`api=${servers.apiAddress}\n`);

  const shutdown = async (): Promise<void> => {
    await servers.close();
    await runtimeHandle.close();
    process.exit(0);
  };

  process.on("SIGINT", () => {
    void shutdown();
  });
  process.on("SIGTERM", () => {
    void shutdown();
  });
}

void main().catch((error: unknown) => {
  process.stderr.write(`${String(error)}\n`);
  process.exit(1);
});
