import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import type {
  AgentTraceClaudeHookConfig,
  AgentTraceCliConfig,
  CliConfigStore,
  ClaudeHooksInstallResult,
  ClaudeSettingsEnvironment,
  ClaudeSettingsDocument,
  ClaudeSettingsHookCommand,
  ClaudeSettingsHookEntry,
  ClaudeSettingsHooks
} from "./types";

const CONFIG_FILE_NAME = "agent-trace.json";
const CLAUDE_HOOKS_FILE_NAME = "agent-trace-claude-hooks.json";
const CLAUDE_GLOBAL_SETTINGS_FILE_NAME = "settings.json";
const CLAUDE_LOCAL_SETTINGS_FILE_NAME = "settings.local.json";

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
  if (typeof parsed["hookCommand"] !== "string" || parsed["hookCommand"].length === 0) {
    return undefined;
  }
  if (typeof parsed["updatedAt"] !== "string" || parsed["updatedAt"].length === 0) {
    return undefined;
  }

  return {
    version: "1.0",
    collectorUrl: parsed["collectorUrl"],
    privacyTier: parsed["privacyTier"],
    hookCommand: parsed["hookCommand"],
    updatedAt: parsed["updatedAt"]
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isGlobalClaudeConfigDir(configDir: string): boolean {
  const globalClaudeDir = path.join(os.homedir(), ".claude");
  return path.resolve(configDir) === path.resolve(globalClaudeDir);
}

interface ReadSettingsResult {
  readonly exists: boolean;
  readonly settings: ClaudeSettingsDocument;
}

function readSettingsDocument(filePath: string): ReadSettingsResult {
  if (!fs.existsSync(filePath)) {
    return {
      exists: false,
      settings: {}
    };
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8")) as unknown;
    if (!isRecord(parsed)) {
      return {
        exists: true,
        settings: {}
      };
    }
    return {
      exists: true,
      settings: parsed as ClaudeSettingsDocument
    };
  } catch {
    return {
      exists: true,
      settings: {}
    };
  }
}

function toMutableHooks(settings: ClaudeSettingsDocument): Record<string, unknown[]> {
  const mutableHooks: Record<string, unknown[]> = {};
  const hooks = settings["hooks"];
  if (!isRecord(hooks)) {
    return mutableHooks;
  }

  for (const [eventName, value] of Object.entries(hooks)) {
    if (Array.isArray(value)) {
      mutableHooks[eventName] = [...value];
      continue;
    }
    mutableHooks[eventName] = [];
  }

  return mutableHooks;
}

function toMutableEnv(settings: ClaudeSettingsDocument): Record<string, string> {
  const mutableEnv: Record<string, string> = {};
  const env = settings["env"];
  if (!isRecord(env)) {
    return mutableEnv;
  }

  for (const [key, value] of Object.entries(env)) {
    if (typeof value === "string") {
      mutableEnv[key] = value;
    }
  }

  return mutableEnv;
}

function hasCommandOnEvent(entries: readonly unknown[], expectedCommand: string): boolean {
  return entries.some((entry) => {
    if (!isRecord(entry)) {
      return false;
    }
    const hooks = entry["hooks"];
    if (!Array.isArray(hooks)) {
      return false;
    }
    return hooks.some((hook) => {
      if (!isRecord(hook)) {
        return false;
      }
      return hook["type"] === "command" && hook["command"] === expectedCommand;
    });
  });
}

function createCommandEntry(command: string): ClaudeSettingsHookEntry {
  const commandHook: ClaudeSettingsHookCommand = {
    type: "command",
    command,
    timeout: 10
  };
  return {
    hooks: [commandHook]
  };
}

function areHooksInstalled(hooksMap: Record<string, unknown[]>, config: AgentTraceClaudeHookConfig): boolean {
  return config.hooks.every((entry) => {
    const entries = hooksMap[entry.event] ?? [];
    return hasCommandOnEvent(entries, entry.command);
  });
}

function toSettingsDocument(
  settings: ClaudeSettingsDocument,
  hooksMap: Record<string, unknown[]>,
  envMap: Record<string, string>
): ClaudeSettingsDocument {
  const hooks: ClaudeSettingsHooks = hooksMap;
  const env: ClaudeSettingsEnvironment = envMap;
  return {
    ...settings,
    hooks,
    ...(Object.keys(env).length > 0 ? { env } : {})
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

  public resolveHooksPath(configDirOverride?: string): string {
    return path.join(this.resolveConfigDir(configDirOverride), CLAUDE_HOOKS_FILE_NAME);
  }

  public resolveClaudeSettingsPath(configDirOverride?: string): string {
    const configDir = this.resolveConfigDir(configDirOverride);
    const settingsFileName = isGlobalClaudeConfigDir(configDir)
      ? CLAUDE_GLOBAL_SETTINGS_FILE_NAME
      : CLAUDE_LOCAL_SETTINGS_FILE_NAME;
    return path.join(configDir, settingsFileName);
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

  public writeClaudeHooks(config: AgentTraceClaudeHookConfig, configDirOverride?: string): string {
    const configDir = this.resolveConfigDir(configDirOverride);
    fs.mkdirSync(configDir, { recursive: true });

    const hooksPath = this.resolveHooksPath(configDirOverride);
    fs.writeFileSync(hooksPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
    return hooksPath;
  }

  public installClaudeHooks(
    config: AgentTraceClaudeHookConfig,
    configDirOverride?: string,
    settingsEnv: ClaudeSettingsEnvironment = {}
  ): ClaudeHooksInstallResult {
    const configDir = this.resolveConfigDir(configDirOverride);
    fs.mkdirSync(configDir, { recursive: true });

    const settingsPath = this.resolveClaudeSettingsPath(configDirOverride);
    const read = readSettingsDocument(settingsPath);
    const hooksMap = toMutableHooks(read.settings);
    const envMap = toMutableEnv(read.settings);
    let changed = !read.exists;

    for (const hook of config.hooks) {
      const eventEntries = hooksMap[hook.event] ?? [];
      if (!hasCommandOnEvent(eventEntries, hook.command)) {
        eventEntries.push(createCommandEntry(hook.command));
        hooksMap[hook.event] = eventEntries;
        changed = true;
      }
    }

    Object.entries(settingsEnv).forEach(([key, value]) => {
      if (envMap[key] !== value) {
        envMap[key] = value;
        changed = true;
      }
    });

    const installed = areHooksInstalled(hooksMap, config);
    if (changed) {
      const updatedSettings = toSettingsDocument(read.settings, hooksMap, envMap);
      fs.writeFileSync(settingsPath, `${JSON.stringify(updatedSettings, null, 2)}\n`, "utf8");
    }

    return {
      settingsPath,
      installed
    };
  }

  public isClaudeHooksInstalled(config: AgentTraceClaudeHookConfig, configDirOverride?: string): boolean {
    const settingsPath = this.resolveClaudeSettingsPath(configDirOverride);
    const read = readSettingsDocument(settingsPath);
    if (!read.exists) {
      return false;
    }

    const hooksMap = toMutableHooks(read.settings);
    return areHooksInstalled(hooksMap, config);
  }
}
