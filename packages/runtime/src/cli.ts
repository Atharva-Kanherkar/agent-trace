#!/usr/bin/env node
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import { createDatabaseBackedRuntime } from "./database-runtime";
import { parseRuntimeDatabaseConfigFromEnv } from "./env";
import { runRuntimeDatabaseMigrations } from "./migrations";
import { createInMemoryRuntime, startInMemoryRuntimeServers, type InMemoryRuntime } from "./runtime";
import { createSqliteBackedRuntime } from "./sqlite-runtime";
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

function readBooleanEnv(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined) {
    return fallback;
  }

  const normalized = raw.trim().toLowerCase();
  if (normalized === "1" || normalized === "true") {
    return true;
  }
  if (normalized === "0" || normalized === "false") {
    return false;
  }

  return fallback;
}

type RuntimeServiceRole = "all" | "collector" | "api";

function readServiceRoleEnv(name: string): RuntimeServiceRole {
  const raw = process.env[name];
  if (raw === "collector" || raw === "api") {
    return raw;
  }
  return "all";
}

function readPrivacyTierEnv(name: string): 1 | 2 | 3 {
  const raw = process.env[name];
  if (raw === "1") {
    return 1;
  }
  if (raw === "3") {
    return 3;
  }
  return 2;
}

function resolveDefaultSqlitePath(): string {
  const dataDir = path.join(os.homedir(), ".agent-trace");
  fs.mkdirSync(dataDir, { recursive: true });
  return path.join(dataDir, "data.db");
}

function hasArg(flag: string): boolean {
  return process.argv.includes(flag);
}

async function main(): Promise<void> {
  const host = process.env["RUNTIME_HOST"] ?? "127.0.0.1";
  const collectorPort = readNumberEnv("COLLECTOR_PORT", 8317);
  const apiPort = readNumberEnv("API_PORT", 8318);
  const dashboardPort = readNumberEnv("DASHBOARD_PORT", 3100);
  const serviceRole = readServiceRoleEnv("RUNTIME_SERVICE_ROLE");
  const enableCollectorServer = serviceRole !== "api";
  const enableApiServer = serviceRole !== "collector";
  const enableOtelReceiver = serviceRole !== "api";
  const otelPrivacyTier = readPrivacyTierEnv("OTEL_PRIVACY_TIER");
  const runMigrations = readBooleanEnv("RUNTIME_RUN_MIGRATIONS", true);
  const startedAtMs = Date.now();

  const dbConfig = parseRuntimeDatabaseConfigFromEnv(process.env as Record<string, string | undefined>);
  const sqlitePath = process.env["SQLITE_DB_PATH"] ?? resolveDefaultSqlitePath();
  const standaloneMode = dbConfig === undefined && !hasArg("--no-sqlite");

  let migrationSummary:
    | {
        readonly clickHouseStatements: number;
        readonly postgresStatements: number;
      }
    | undefined;
  let hydratedSessionTraces: number | undefined;
  let runtimeHandle: {
    readonly mode: "in-memory" | "db-backed" | "sqlite";
    readonly runtime: InMemoryRuntime;
    close(): Promise<void>;
  };

  if (standaloneMode) {
    const sqliteRuntime = createSqliteBackedRuntime({
      dbPath: sqlitePath,
      startedAtMs
    });
    hydratedSessionTraces = sqliteRuntime.hydratedCount;
    runtimeHandle = {
      mode: "sqlite",
      runtime: sqliteRuntime.runtime,
      close: sqliteRuntime.close
    };
  } else if (dbConfig === undefined) {
    runtimeHandle = {
      mode: "in-memory",
      runtime: createInMemoryRuntime({
        startedAtMs
      }),
      close: async (): Promise<void> => Promise.resolve()
    };
  } else {
    if (runMigrations) {
      const migrationResult = await runRuntimeDatabaseMigrations(dbConfig);
      migrationSummary = {
        clickHouseStatements: migrationResult.clickHouse.executedStatements,
        postgresStatements: migrationResult.postgres.executedStatements
      };
    }

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
      enableOtelReceiver,
      otelPrivacyTier
    });
  } catch (error: unknown) {
    await runtimeHandle.close();
    throw error;
  }

  let dashboardAddress: string | undefined;
  if (standaloneMode) {
    try {
      const dashboardModulePath = path.resolve(__dirname, "../../../dashboard/dist/src/web-server.js");
      const dashboardModule = (await import(dashboardModulePath)) as {
        startDashboardServer: (options: {
          host?: string;
          port?: number;
          apiBaseUrl?: string;
          startedAtMs?: number;
        }) => Promise<{ address: string; apiBaseUrl: string; close(): Promise<void> }>;
      };
      const apiBaseUrl = `http://${host === "0.0.0.0" ? "127.0.0.1" : host}:${String(apiPort)}`;
      const dashboard = await dashboardModule.startDashboardServer({
        host,
        port: dashboardPort,
        apiBaseUrl,
        startedAtMs
      });
      dashboardAddress = dashboard.address;

      const originalShutdown = servers.close;
      servers = {
        ...servers,
        close: async (): Promise<void> => {
          await dashboard.close();
          await originalShutdown();
        }
      };
    } catch {
      // dashboard is optional in standalone mode
    }
  }

  process.stdout.write("\n");
  process.stdout.write("  agent-trace\n");
  process.stdout.write(`  mode: ${runtimeHandle.mode}\n`);
  if (runtimeHandle.mode === "sqlite") {
    process.stdout.write(`  database: ${sqlitePath}\n`);
  }
  if (migrationSummary !== undefined) {
    process.stdout.write(`  migrations: clickhouse=${String(migrationSummary.clickHouseStatements)} postgres=${String(migrationSummary.postgresStatements)}\n`);
  }
  if (hydratedSessionTraces !== undefined) {
    process.stdout.write(`  sessions loaded: ${String(hydratedSessionTraces)}\n`);
  }
  process.stdout.write("\n");
  if (servers.collectorAddress !== undefined) {
    process.stdout.write(`  collector  http://${servers.collectorAddress}\n`);
  }
  if (servers.apiAddress !== undefined) {
    process.stdout.write(`  api        http://${servers.apiAddress}\n`);
  }
  if (servers.otelGrpcAddress !== undefined) {
    process.stdout.write(`  otel grpc  ${servers.otelGrpcAddress}\n`);
  }
  if (dashboardAddress !== undefined) {
    process.stdout.write(`  dashboard  http://${dashboardAddress}\n`);
  }
  process.stdout.write("\n");

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
