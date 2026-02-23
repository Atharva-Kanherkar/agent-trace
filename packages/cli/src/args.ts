import type { CliCommand, CliParsedArgs, PrivacyTier } from "./types";

function isCliCommand(value: string | undefined): value is CliCommand {
  return value === "init" || value === "status" || value === "hook-handler";
}

function parsePrivacyTier(value: string | undefined): PrivacyTier | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === "1" || value === "2" || value === "3") {
    return Number(value) as PrivacyTier;
  }
  return undefined;
}

export function parseArgs(argv: readonly string[]): CliParsedArgs {
  const commandCandidate = argv[2];
  const command = isCliCommand(commandCandidate) ? commandCandidate : undefined;

  let configDir: string | undefined;
  let collectorUrl: string | undefined;
  let privacyTier: PrivacyTier | undefined;
  let forward = false;

  for (let i = 3; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--forward") {
      forward = true;
      continue;
    }
    if (token === "--config-dir") {
      const value = argv[i + 1];
      if (typeof value === "string" && value.length > 0) {
        configDir = value;
      }
      i += 1;
      continue;
    }
    if (token === "--collector-url") {
      const value = argv[i + 1];
      if (typeof value === "string" && value.length > 0) {
        collectorUrl = value;
      }
      i += 1;
      continue;
    }
    if (token === "--privacy-tier") {
      const value = argv[i + 1];
      privacyTier = parsePrivacyTier(value);
      i += 1;
      continue;
    }
  }

  return {
    command,
    ...(configDir !== undefined ? { configDir } : {}),
    ...(collectorUrl !== undefined ? { collectorUrl } : {}),
    ...(privacyTier !== undefined ? { privacyTier } : {}),
    ...(forward ? { forward: true } : {})
  };
}
