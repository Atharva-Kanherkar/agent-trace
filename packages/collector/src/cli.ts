#!/usr/bin/env node
import { startStandaloneCollector } from "./server";

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

function readPrivacyTierEnv(name: string): 1 | 2 | 3 {
  const value = readNumberEnv(name, 1);
  if (value === 2 || value === 3) {
    return value;
  }
  return 1;
}

async function main(): Promise<void> {
  const host = process.env["COLLECTOR_HOST"] ?? "127.0.0.1";
  const httpPort = readNumberEnv("COLLECTOR_PORT", 8317);
  const privacyTier = readPrivacyTierEnv("COLLECTOR_PRIVACY_TIER");
  const otelGrpcAddress = process.env["OTEL_GRPC_ADDRESS"] ?? `${host}:4717`;

  const collector = await startStandaloneCollector({
    host,
    httpPort,
    privacyTier,
    otelGrpcAddress
  });

  process.stdout.write("collector started\n");
  process.stdout.write(`http=${collector.httpAddress}\n`);
  process.stdout.write(`otelGrpc=${collector.otelGrpcAddress}\n`);

  const shutdown = async (): Promise<void> => {
    await collector.close();
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
