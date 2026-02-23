#!/usr/bin/env node
import { createInMemoryRuntime, startInMemoryRuntimeServers } from "./runtime";

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

  const runtime = createInMemoryRuntime();
  const servers = await startInMemoryRuntimeServers(runtime, {
    host,
    collectorPort,
    apiPort
  });

  process.stdout.write(`runtime started\n`);
  process.stdout.write(`collector=${servers.collectorAddress}\n`);
  process.stdout.write(`api=${servers.apiAddress}\n`);

  const shutdown = async (): Promise<void> => {
    await servers.close();
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

