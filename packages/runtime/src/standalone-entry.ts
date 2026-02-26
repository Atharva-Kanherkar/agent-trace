/**
 * Standalone entry point for `npx agent-trace`.
 * Bundles collector, api, dashboard, and sqlite into a single process.
 * This file is the esbuild entry point — all imports are resolved statically.
 */
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import { startDashboardServer } from "../../dashboard/src/web-server";
import { createSqliteBackedRuntime, type SqliteRuntimeHandle } from "./sqlite-runtime";
import { createInMemoryRuntime, startInMemoryRuntimeServers, type InMemoryRuntime } from "./runtime";
import type { RuntimeStartedServers } from "./types";

function readNumberEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function readPrivacyTierEnv(name: string): 1 | 2 | 3 {
  const raw = process.env[name];
  if (raw === "1") return 1;
  if (raw === "3") return 3;
  return 2;
}

function resolveDefaultSqlitePath(): string {
  const dataDir = path.join(os.homedir(), ".agent-trace");
  fs.mkdirSync(dataDir, { recursive: true });
  return path.join(dataDir, "data.db");
}

async function main(): Promise<void> {
  const host = process.env["RUNTIME_HOST"] ?? "127.0.0.1";
  const collectorPort = readNumberEnv("COLLECTOR_PORT", 8317);
  const apiPort = readNumberEnv("API_PORT", 8318);
  const dashboardPort = readNumberEnv("DASHBOARD_PORT", 3100);
  const otelPrivacyTier = readPrivacyTierEnv("OTEL_PRIVACY_TIER");
  const startedAtMs = Date.now();
  const sqlitePath = process.env["SQLITE_DB_PATH"] ?? resolveDefaultSqlitePath();

  let sqliteHandle: SqliteRuntimeHandle | undefined;
  let runtime: InMemoryRuntime;
  let hydratedCount = 0;

  const hasExternalDb =
    process.env["CLICKHOUSE_URL"] !== undefined &&
    process.env["POSTGRES_CONNECTION_STRING"] !== undefined;

  if (hasExternalDb) {
    process.stderr.write("standalone mode does not support CLICKHOUSE_URL/POSTGRES_CONNECTION_STRING.\n");
    process.stderr.write("use Docker or the full runtime for external database support.\n");
    process.exit(1);
  }

  sqliteHandle = createSqliteBackedRuntime({ dbPath: sqlitePath, startedAtMs });
  runtime = sqliteHandle.runtime;
  hydratedCount = sqliteHandle.hydratedCount;

  let servers: RuntimeStartedServers;
  try {
    servers = await startInMemoryRuntimeServers(runtime, {
      host,
      collectorPort,
      apiPort,
      enableCollectorServer: true,
      enableApiServer: true,
      enableOtelReceiver: false,
      otelPrivacyTier
    });
  } catch (error: unknown) {
    if (sqliteHandle !== undefined) await sqliteHandle.close();
    throw error;
  }

  const apiBaseUrl = `http://${host === "0.0.0.0" ? "127.0.0.1" : host}:${String(apiPort)}`;
  let dashboardAddress: string | undefined;
  try {
    const dashboard = await startDashboardServer({
      host,
      port: dashboardPort,
      apiBaseUrl,
      startedAtMs
    });
    dashboardAddress = dashboard.address;

    const originalClose = servers.close;
    servers = {
      ...servers,
      close: async (): Promise<void> => {
        await dashboard.close();
        await originalClose();
      }
    };
  } catch {
    // dashboard is best-effort
  }

  process.stdout.write("\n");
  process.stdout.write("  agent-trace\n");
  process.stdout.write(`  database: ${sqlitePath}\n`);
  if (hydratedCount > 0) {
    process.stdout.write(`  sessions loaded: ${String(hydratedCount)}\n`);
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
    if (sqliteHandle !== undefined) await sqliteHandle.close();
    process.exit(0);
  };

  process.on("SIGINT", () => { void shutdown(); });
  process.on("SIGTERM", () => { void shutdown(); });
}

void main().catch((error: unknown) => {
  process.stderr.write(`${String(error)}\n`);
  process.exit(1);
});
