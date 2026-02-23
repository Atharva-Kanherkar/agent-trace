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

type RuntimeServiceRole = "all" | "collector" | "api";

function readServiceRoleEnv(name: string): RuntimeServiceRole {
  const raw = process.env[name];
  if (raw === "collector" || raw === "api") {
    return raw;
  }
  return "all";
}

async function main(): Promise<void> {
  const host = process.env["RUNTIME_HOST"] ?? "127.0.0.1";
  const collectorPort = readNumberEnv("COLLECTOR_PORT", 8317);
  const apiPort = readNumberEnv("API_PORT", 8318);
  const serviceRole = readServiceRoleEnv("RUNTIME_SERVICE_ROLE");
  const enableCollectorServer = serviceRole !== "api";
  const enableApiServer = serviceRole !== "collector";
  const enableOtelReceiver = serviceRole !== "api";
  const startedAtMs = Date.now();

  const dbConfig = parseRuntimeDatabaseConfigFromEnv(process.env as Record<string, string | undefined>);
  let migrationSummary:
    | {
        readonly clickHouseStatements: number;
        readonly postgresStatements: number;
      }
    | undefined;
  let hydratedSessionTraces: number | undefined;
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

    const dbRuntime = createDatabaseBackedRuntime({
      startedAtMs,
      clickHouse: dbConfig.clickHouse,
      postgres: dbConfig.postgres
    });
    hydratedSessionTraces = await dbRuntime.hydratedSessionTraces;

    runtimeHandle = {
      mode: "db-backed",
      ...dbRuntime
    };
  }

  let servers: RuntimeStartedServers;
  try {
    servers = await startInMemoryRuntimeServers(runtimeHandle.runtime, {
      host,
      collectorPort,
      apiPort,
      enableCollectorServer,
      enableApiServer,
      enableOtelReceiver
    });
  } catch (error: unknown) {
    await runtimeHandle.close();
    throw error;
  }

  process.stdout.write(`runtime started\n`);
  process.stdout.write(`mode=${runtimeHandle.mode}\n`);
  process.stdout.write(`role=${serviceRole}\n`);
  if (migrationSummary !== undefined) {
    process.stdout.write(`migrations.clickhouse.statements=${String(migrationSummary.clickHouseStatements)}\n`);
    process.stdout.write(`migrations.postgres.statements=${String(migrationSummary.postgresStatements)}\n`);
  }
  if (hydratedSessionTraces !== undefined) {
    process.stdout.write(`hydrated.session_traces=${String(hydratedSessionTraces)}\n`);
  }
  if (servers.collectorAddress !== undefined) {
    process.stdout.write(`collector=${servers.collectorAddress}\n`);
  }
  if (servers.apiAddress !== undefined) {
    process.stdout.write(`api=${servers.apiAddress}\n`);
  }
  if (servers.otelGrpcAddress !== undefined) {
    process.stdout.write(`otelGrpc=${servers.otelGrpcAddress}\n`);
  }

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
