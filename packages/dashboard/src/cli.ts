#!/usr/bin/env node
import { startDashboardServer } from "./web-server";

function readNumberEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined) {
    return fallback;
  }

  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return fallback;
  }
  return parsed;
}

async function main(): Promise<void> {
  const host = process.env["DASHBOARD_HOST"] ?? "127.0.0.1";
  const port = readNumberEnv("DASHBOARD_PORT", 3100);
  const apiBaseUrl = process.env["DASHBOARD_API_BASE_URL"] ?? "http://127.0.0.1:8318";

  const dashboard = await startDashboardServer({
    host,
    port,
    apiBaseUrl
  });

  process.stdout.write("dashboard started\n");
  process.stdout.write(`address=${dashboard.address}\n`);
  process.stdout.write(`apiBaseUrl=${dashboard.apiBaseUrl}\n`);

  const shutdown = async (): Promise<void> => {
    await dashboard.close();
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
