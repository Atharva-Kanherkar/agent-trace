import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import type { AgentTraceCliConfig, CliConfigStore } from "./types";

const CONFIG_FILE_NAME = "agent-trace.json";

function ensurePrivacyTier(value: unknown): value is 1 | 2 | 3 {
  return value === 1 || value === 2 || value === 3;
}

function parseConfig(raw: string): AgentTraceCliConfig | undefined {
  const parsedUnknown = JSON.parse(raw) as unknown;
  if (typeof parsedUnknown !== "object" || parsedUnknown === null) {
    return undefined;
  }

  const parsed = parsedUnknown as Record<string, unknown>;
  if (parsed["version"] !== "1.0") {
    return undefined;
  }
  if (typeof parsed["collectorUrl"] !== "string" || parsed["collectorUrl"].length === 0) {
    return undefined;
  }
  if (!ensurePrivacyTier(parsed["privacyTier"])) {
    return undefined;
  }
  if (parsed["hookCommand"] !== "agent-trace hook-handler") {
    return undefined;
  }
  if (typeof parsed["updatedAt"] !== "string" || parsed["updatedAt"].length === 0) {
    return undefined;
  }

  return {
    version: "1.0",
    collectorUrl: parsed["collectorUrl"],
    privacyTier: parsed["privacyTier"],
    hookCommand: "agent-trace hook-handler",
    updatedAt: parsed["updatedAt"]
  };
}

export class FileCliConfigStore implements CliConfigStore {
  public resolveConfigDir(configDirOverride?: string): string {
    if (configDirOverride !== undefined && configDirOverride.length > 0) {
      return configDirOverride;
    }

    const fromEnv = process.env["AGENT_TRACE_CONFIG_DIR"];
    if (typeof fromEnv === "string" && fromEnv.length > 0) {
      return fromEnv;
    }

    return path.join(os.homedir(), ".claude");
  }

  public resolveConfigPath(configDirOverride?: string): string {
    return path.join(this.resolveConfigDir(configDirOverride), CONFIG_FILE_NAME);
  }

  public readConfig(configDirOverride?: string): AgentTraceCliConfig | undefined {
    const configPath = this.resolveConfigPath(configDirOverride);
    if (!fs.existsSync(configPath)) {
      return undefined;
    }

    const raw = fs.readFileSync(configPath, "utf8");
    return parseConfig(raw);
  }

  public writeConfig(config: AgentTraceCliConfig, configDirOverride?: string): string {
    const configDir = this.resolveConfigDir(configDirOverride);
    fs.mkdirSync(configDir, { recursive: true });

    const configPath = this.resolveConfigPath(configDirOverride);
    fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
    return configPath;
  }
}

