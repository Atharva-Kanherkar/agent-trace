/**
 * Standalone entry point for `npx agent-trace`.
 * Bundles collector, api, dashboard, sqlite, AND cli into a single process.
 * This file is the esbuild entry point — all imports are resolved statically.
 *
 * Subcommands:
 *   (none) / start  — start the server (collector + api + dashboard + sqlite)
 *   init             — configure Claude Code hooks
 *   status           — check if hooks are installed
 *   hook-handler     — process a hook event from stdin (called by Claude Code)
 */
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import { startDashboardServer } from "../../dashboard/src/web-server";
import { createSqliteBackedRuntime, type SqliteRuntimeHandle } from "./sqlite-runtime";
import { createInMemoryRuntime, startInMemoryRuntimeServers, type InMemoryRuntime } from "./runtime";
import type { RuntimeStartedServers } from "./types";

// CLI modules — esbuild bundles these statically
import { parseArgs } from "../../cli/src/args";
import { runInit } from "../../cli/src/init";
import { runStatus } from "../../cli/src/status";
import { runHookHandler, runHookHandlerAndForward } from "../../cli/src/hook-handler";
import { FileCliConfigStore } from "../../cli/src/config-store";

// ---------------------------------------------------------------------------
// Server helpers
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// CLI helpers
// ---------------------------------------------------------------------------

async function readStdin(): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    let buffer = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => {
      buffer += chunk;
    });
    process.stdin.on("end", () => resolve(buffer));
    process.stdin.on("error", (error) => reject(error));
  });
}

function printUsage(): void {
  process.stdout.write(
    "\nusage: agent-trace <command>\n\n" +
    "commands:\n" +
    "  (none)        start the server (collector + api + dashboard)\n" +
    "  init          configure Claude Code hooks\n" +
    "  status        check if hooks are installed\n" +
    "  hook-handler  process a hook event from stdin\n\n" +
    "options:\n" +
    "  --collector-url <url>    collector endpoint (default: http://127.0.0.1:8317/v1/hooks)\n" +
    "  --privacy-tier <1|2|3>   privacy tier (default: 2)\n" +
    "  --install-hooks          install hooks into Claude settings (default for init)\n" +
    "  --no-install-hooks       skip hook installation\n" +
    "  --forward                forward hook event to collector (hook-handler)\n" +
    "  --config-dir <path>      config directory (default: ~/.claude)\n" +
    "\n"
  );
}

// ---------------------------------------------------------------------------
// CLI command handlers
// ---------------------------------------------------------------------------

async function handleCliCommand(args: ReturnType<typeof parseArgs>): Promise<void> {
  const command = args.command;

  if (command === "init") {
    const result = runInit({
      ...(args.configDir !== undefined ? { configDir: args.configDir } : {}),
      ...(args.collectorUrl !== undefined ? { collectorUrl: args.collectorUrl } : {}),
      ...(args.privacyTier !== undefined ? { privacyTier: args.privacyTier } : {}),
      ...(args.installHooks !== undefined ? { installHooks: args.installHooks } : {})
    });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }

  if (command === "status") {
    const result = runStatus(args.configDir);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    process.exitCode = result.ok ? 0 : 1;
    return;
  }

  // hook-handler: read from stdin
  const rawStdin = await readStdin();
  if (args.forward === true) {
    const result = await runHookHandlerAndForward({
      rawStdin,
      ...(args.configDir !== undefined ? { configDir: args.configDir } : {}),
      ...(args.collectorUrl !== undefined ? { collectorUrl: args.collectorUrl } : {})
    });
    if (!result.ok) {
      process.stderr.write(`${JSON.stringify(result, null, 2)}\n`);
      process.exitCode = 1;
      return;
    }
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }

  const result = runHookHandler({
    rawStdin,
    ...(args.configDir !== undefined ? { configDir: args.configDir } : {})
  });
  if (!result.ok) {
    process.stderr.write(`${JSON.stringify(result, null, 2)}\n`);
    process.exitCode = 1;
    return;
  }
  process.stdout.write(`${JSON.stringify(result.envelope, null, 2)}\n`);
}

// ---------------------------------------------------------------------------
// Server start
// ---------------------------------------------------------------------------

async function startServer(): Promise<void> {
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
  const cliConfigStore = new FileCliConfigStore();
  const cliConfig = cliConfigStore.readConfig();
  const currentUserEmail = cliConfig?.userEmail;
  let dashboardAddress: string | undefined;
  try {
    const dashboard = await startDashboardServer({
      host,
      port: dashboardPort,
      apiBaseUrl,
      startedAtMs,
      ...(currentUserEmail !== undefined ? { currentUserEmail } : {})
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

// ---------------------------------------------------------------------------
// Entry point — route to server or CLI subcommand
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const args = parseArgs(process.argv);
  const command = args.command;

  // "help" flag or unknown command
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    printUsage();
    return;
  }

  // CLI subcommands: init, status, hook-handler
  if (command === "init" || command === "status" || command === "hook-handler") {
    await handleCliCommand(args);
    return;
  }

  // No subcommand (or unrecognized) → start the server
  await startServer();
}

void main().catch((error: unknown) => {
  process.stderr.write(`${String(error)}\n`);
  process.exit(1);
});
