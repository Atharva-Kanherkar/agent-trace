import type { EventEnvelope } from "../../schema/src/types";

export type PlatformEventPayload = Readonly<Record<string, unknown>>;
export type PlatformEventEnvelope = EventEnvelope<PlatformEventPayload>;

export interface ClickHouseAgentEventRow {
  readonly event_id: string;
  readonly event_type: string;
  readonly event_timestamp: string;
  readonly session_id: string;
  readonly prompt_id: string | null;
  readonly user_id: string;
  readonly source: string;
  readonly agent_type: string;
  readonly tool_name: string | null;
  readonly tool_success: 0 | 1 | null;
  readonly tool_duration_ms: number | null;
  readonly model: string | null;
  readonly cost_usd: number | null;
  readonly input_tokens: number | null;
  readonly output_tokens: number | null;
  readonly api_duration_ms: number | null;
  readonly lines_added: number | null;
  readonly lines_removed: number | null;
  readonly files_changed: readonly string[];
  readonly commit_sha: string | null;
  readonly attributes: Readonly<Record<string, string>>;
}

export interface ClickHouseInsertRequest<TRow> {
  readonly table: string;
  readonly rows: readonly TRow[];
}

export interface ClickHouseInsertClient<TRow> {
  insertJsonEachRow(request: ClickHouseInsertRequest<TRow>): Promise<void>;
}

export interface ClickHouseEventWriterOptions {
  readonly tableName?: string;
}

export interface ClickHouseWriteSummary {
  readonly tableName: string;
  readonly writtenRows: number;
}

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonArray;
export interface JsonObject {
  readonly [key: string]: JsonValue;
}
export interface JsonArray extends ReadonlyArray<JsonValue> {}

export interface PostgresSessionRow {
  readonly session_id: string;
  readonly user_id: string;
  readonly started_at: string;
  readonly ended_at: string | null;
  readonly status: "active" | "completed";
  readonly project_path: string | null;
  readonly git_repo: string | null;
  readonly git_branch: string | null;
}

export interface PostgresCommitRow {
  readonly sha: string;
  readonly session_id: string;
  readonly prompt_id: string | null;
  readonly message: string | null;
  readonly lines_added: number;
  readonly lines_removed: number;
  readonly chain_cost_usd: number;
  readonly committed_at: string | null;
}

export interface PostgresInstanceSettingRow {
  readonly key: string;
  readonly value: JsonValue;
}

export interface PostgresSessionPersistenceClient {
  upsertSessions(rows: readonly PostgresSessionRow[]): Promise<void>;
  upsertCommits(rows: readonly PostgresCommitRow[]): Promise<void>;
}

export interface PostgresSettingsPersistenceClient {
  upsertInstanceSettings(rows: readonly PostgresInstanceSettingRow[]): Promise<void>;
}

export interface PostgresSessionWriterSummary {
  readonly writtenSessions: number;
  readonly writtenCommits: number;
}

export interface PostgresSettingsWriterSummary {
  readonly writtenSettings: number;
}
