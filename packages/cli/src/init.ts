import { buildClaudeHookConfig } from "./claude-hooks";
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

function shouldInstallHooks(value: boolean | undefined): boolean {
  if (value === undefined) {
    return true;
  }
  return value;
}

export function runInit(input: InitCommandInput, store: CliConfigStore = new FileCliConfigStore()): InitCommandResult {
  const timestamp = nowIso(input.nowIso);
  const config = {
    version: "1.0" as const,
    collectorUrl: input.collectorUrl ?? "http://127.0.0.1:8317/v1/hooks",
    privacyTier: ensurePrivacyTierOrDefault(input.privacyTier),
    hookCommand: "agent-trace hook-handler --forward",
    updatedAt: timestamp
  };
  const hooks = buildClaudeHookConfig(config.hookCommand, timestamp);

  const configPath = store.writeConfig(config, input.configDir);
  const hooksPath = store.writeClaudeHooks(hooks, input.configDir);
  const installResult = shouldInstallHooks(input.installHooks)
    ? store.installClaudeHooks(hooks, input.configDir)
    : {
        settingsPath: store.resolveClaudeSettingsPath(input.configDir),
        installed: store.isClaudeHooksInstalled(hooks, input.configDir)
      };

  return {
    ok: true,
    configPath,
    hooksPath,
    settingsPath: installResult.settingsPath,
    settingsHooksInstalled: installResult.installed,
    config,
    hooks
  };
}
