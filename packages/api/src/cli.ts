#!/usr/bin/env node
import { startApiServer } from "./server";

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
  const host = process.env["API_HOST"] ?? "127.0.0.1";
  const port = readNumberEnv("API_PORT", 8318);

  const api = await startApiServer({
    host,
    port
  });

  process.stdout.write("api started\n");
  process.stdout.write(`address=${api.address}\n`);

  const shutdown = async (): Promise<void> => {
    await api.close();
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
