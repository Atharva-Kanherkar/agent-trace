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
