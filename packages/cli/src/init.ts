import { buildClaudeHookConfig } from "./claude-hooks";
import type { CliConfigStore, InitCommandInput, InitCommandResult, PrivacyTier } from "./types";
import { FileCliConfigStore } from "./config-store";

function ensurePrivacyTierOrDefault(value: PrivacyTier | undefined): PrivacyTier {
  if (value === undefined) {
    return 2;
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

function deriveOtelLogsEndpoint(collectorUrl: string): string {
  try {
    const parsed = new URL(collectorUrl);
    parsed.port = "4717";
    parsed.pathname = "";
    parsed.search = "";
    parsed.hash = "";
    const value = parsed.toString();
    return value.endsWith("/") ? value.slice(0, -1) : value;
  } catch {
    return "http://127.0.0.1:4717";
  }
}

function buildTelemetryEnv(collectorUrl: string, privacyTier: PrivacyTier): Readonly<Record<string, string>> {
  const enablePromptAndToolDetail = privacyTier >= 2;
  const otelLogsEndpoint = deriveOtelLogsEndpoint(collectorUrl);

  return {
    CLAUDE_CODE_ENABLE_TELEMETRY: "1",
    OTEL_METRICS_EXPORTER: "none",
    OTEL_LOGS_EXPORTER: "otlp",
    OTEL_EXPORTER_OTLP_PROTOCOL: "grpc",
    OTEL_EXPORTER_OTLP_ENDPOINT: otelLogsEndpoint,
    OTEL_EXPORTER_OTLP_LOGS_ENDPOINT: otelLogsEndpoint,
    OTEL_LOG_USER_PROMPTS: enablePromptAndToolDetail ? "1" : "0",
    OTEL_LOG_TOOL_DETAILS: enablePromptAndToolDetail ? "1" : "0"
  };
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
  const telemetryEnv = buildTelemetryEnv(config.collectorUrl, config.privacyTier);
  const hooks = buildClaudeHookConfig(config.hookCommand, timestamp);

  const configPath = store.writeConfig(config, input.configDir);
  const hooksPath = store.writeClaudeHooks(hooks, input.configDir);
  const installResult = shouldInstallHooks(input.installHooks)
    ? store.installClaudeHooks(hooks, input.configDir, telemetryEnv)
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
