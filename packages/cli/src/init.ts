import type { CliConfigStore, InitCommandInput, InitCommandResult, PrivacyTier } from "./types";
import { FileCliConfigStore } from "./config-store";

function ensurePrivacyTierOrDefault(value: PrivacyTier | undefined): PrivacyTier {
  if (value === undefined) {
    return 1;
  }
  return value;
}

function nowIso(inputNowIso?: string): string {
  if (inputNowIso !== undefined) {
    return inputNowIso;
  }
  return new Date().toISOString();
}

export function runInit(input: InitCommandInput, store: CliConfigStore = new FileCliConfigStore()): InitCommandResult {
  const config = {
    version: "1.0" as const,
    collectorUrl: input.collectorUrl ?? "http://127.0.0.1:8317/v1/hooks",
    privacyTier: ensurePrivacyTierOrDefault(input.privacyTier),
    hookCommand: "agent-trace hook-handler" as const,
    updatedAt: nowIso(input.nowIso)
  };

  const configPath = store.writeConfig(config, input.configDir);

  return {
    ok: true,
    configPath,
    config
  };
}

