import fs from "node:fs";

import { FileCliConfigStore } from "./config-store";
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

  return {
    ok: true,
    message: "agent-trace config found",
    configPath,
    hooksPath,
    hooksConfigured: fs.existsSync(hooksPath),
    config
  };
}
