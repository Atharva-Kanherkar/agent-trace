import fs from "node:fs";

import { FileCliConfigStore } from "./config-store";
import { buildClaudeHookConfig } from "./claude-hooks";
import type { CliConfigStore, StatusCommandResult } from "./types";

export function runStatus(configDir?: string, store: CliConfigStore = new FileCliConfigStore()): StatusCommandResult {
  const configPath = store.resolveConfigPath(configDir);
  const hooksPath = store.resolveHooksPath(configDir);
  const config = store.readConfig(configDir);

  if (config === undefined) {
    return {
      ok: false,
      message: "agent-trace config not found",
      configPath
    };
  }

  const settingsPath = store.resolveClaudeSettingsPath(configDir);
  const expectedHooks = buildClaudeHookConfig(config.hookCommand, config.updatedAt);

  return {
    ok: true,
    message: "agent-trace config found",
    configPath,
    hooksPath,
    hooksConfigured: fs.existsSync(hooksPath),
    settingsPath,
    settingsHooksInstalled: store.isClaudeHooksInstalled(expectedHooks, configDir),
    config
  };
}
