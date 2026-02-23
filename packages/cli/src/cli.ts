#!/usr/bin/env node
import { parseArgs } from "./args";
import { runHookHandler, runHookHandlerAndForward } from "./hook-handler";
import { runInit } from "./init";
import { runStatus } from "./status";

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
    "usage: agent-trace <init|status|hook-handler> [--config-dir <path>] [--collector-url <url>] [--privacy-tier <1|2|3>] [--install-hooks|--no-install-hooks] [--forward]\n"
  );
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv);
  const command = args.command;

  if (command === undefined) {
    printUsage();
    process.exitCode = 1;
    return;
  }

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

void main().catch((error: unknown) => {
  process.stderr.write(`${String(error)}\n`);
  process.exitCode = 1;
});
