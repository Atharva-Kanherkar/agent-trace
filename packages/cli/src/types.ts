import type { EventEnvelope, PrivacyTier as SchemaPrivacyTier } from "../../schema/src/types";

export type PrivacyTier = SchemaPrivacyTier;

export type CliCommand = "init" | "status" | "hook-handler";

export interface CliParsedArgs {
  readonly command: CliCommand | undefined;
  readonly configDir?: string;
  readonly collectorUrl?: string;
  readonly privacyTier?: PrivacyTier;
}

export interface AgentTraceCliConfig {
  readonly version: "1.0";
  readonly collectorUrl: string;
  readonly privacyTier: PrivacyTier;
  readonly hookCommand: "agent-trace hook-handler";
  readonly updatedAt: string;
}

export interface CliConfigStore {
  resolveConfigDir(configDirOverride?: string): string;
  resolveConfigPath(configDirOverride?: string): string;
  readConfig(configDirOverride?: string): AgentTraceCliConfig | undefined;
  writeConfig(config: AgentTraceCliConfig, configDirOverride?: string): string;
}

export interface InitCommandInput {
  readonly configDir?: string;
  readonly collectorUrl?: string;
  readonly privacyTier?: PrivacyTier;
  readonly nowIso?: string;
}

export interface InitCommandResult {
  readonly ok: true;
  readonly configPath: string;
  readonly config: AgentTraceCliConfig;
}

export interface StatusCommandResultNotConfigured {
  readonly ok: false;
  readonly message: "agent-trace config not found";
  readonly configPath: string;
}

export interface StatusCommandResultConfigured {
  readonly ok: true;
  readonly message: "agent-trace config found";
  readonly configPath: string;
  readonly config: AgentTraceCliConfig;
}

export type StatusCommandResult = StatusCommandResultConfigured | StatusCommandResultNotConfigured;

export interface HookPayload {
  readonly session_id?: string;
  readonly sessionId?: string;
  readonly prompt_id?: string;
  readonly promptId?: string;
  readonly event?: string;
  readonly type?: string;
  readonly hook?: string;
  readonly timestamp?: string;
  readonly [key: string]: unknown;
}

export interface HookHandlerInput {
  readonly rawStdin: string;
  readonly configDir?: string;
  readonly nowIso?: string;
}

export interface HookHandlerSuccess {
  readonly ok: true;
  readonly envelope: EventEnvelope<HookPayload>;
}

export interface HookHandlerFailure {
  readonly ok: false;
  readonly errors: readonly string[];
}

export type HookHandlerResult = HookHandlerSuccess | HookHandlerFailure;
