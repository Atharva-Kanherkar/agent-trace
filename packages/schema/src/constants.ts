import type { AgentType, EventSource, PrivacyTier, SchemaVersion } from "./types";

export const SCHEMA_VERSION: SchemaVersion = "1.0";
export const EVENT_SOURCES: readonly EventSource[] = ["otel", "hook", "transcript", "git"];
export const PRIVACY_TIERS: readonly PrivacyTier[] = [1, 2, 3];
export const AGENT_TYPES: readonly AgentType[] = ["claude_code"];

