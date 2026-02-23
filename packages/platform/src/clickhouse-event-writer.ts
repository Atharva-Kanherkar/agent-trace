import type {
  ClickHouseAgentEventRow,
  ClickHouseEventWriterOptions,
  ClickHouseInsertClient,
  ClickHouseWriteSummary,
  PlatformEventEnvelope,
  PlatformEventPayload
} from "./persistence-types";

const DEFAULT_TABLE_NAME = "agent_events";

function pickUnknown(payload: PlatformEventPayload, snakeCaseKey: string, camelCaseKey: string): unknown {
  if (snakeCaseKey in payload) {
    return payload[snakeCaseKey];
  }
  if (camelCaseKey in payload) {
    return payload[camelCaseKey];
  }
  return undefined;
}

function pickString(payload: PlatformEventPayload, snakeCaseKey: string, camelCaseKey: string): string | undefined {
  const value = pickUnknown(payload, snakeCaseKey, camelCaseKey);
  if (typeof value === "string" && value.length > 0) {
    return value;
  }
  return undefined;
}

function pickNumber(payload: PlatformEventPayload, snakeCaseKey: string, camelCaseKey: string): number | undefined {
  const value = pickUnknown(payload, snakeCaseKey, camelCaseKey);
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  return undefined;
}

function pickBoolean(payload: PlatformEventPayload, snakeCaseKey: string, camelCaseKey: string): boolean | undefined {
  const value = pickUnknown(payload, snakeCaseKey, camelCaseKey);
  if (typeof value === "boolean") {
    return value;
  }
  if (value === 1) {
    return true;
  }
  if (value === 0) {
    return false;
  }
  return undefined;
}

function pickStringArray(
  payload: PlatformEventPayload,
  snakeCaseKey: string,
  camelCaseKey: string
): readonly string[] {
  const value = pickUnknown(payload, snakeCaseKey, camelCaseKey);
  if (!Array.isArray(value)) {
    return [];
  }

  const values: string[] = [];
  value.forEach((item) => {
    if (typeof item === "string" && item.length > 0) {
      values.push(item);
    }
  });
  return values;
}

function buildAttributes(event: PlatformEventEnvelope): Readonly<Record<string, string>> {
  const attributes: Record<string, string> = {};

  if (event.attributes !== undefined) {
    Object.keys(event.attributes).forEach((key) => {
      const value = event.attributes?.[key];
      if (typeof value === "string") {
        attributes[key] = value;
      }
    });
  }

  attributes["privacy_tier"] = String(event.privacyTier);
  if (event.sourceVersion !== undefined) {
    attributes["source_version"] = event.sourceVersion;
  }

  return attributes;
}

export function toClickHouseAgentEventRow(event: PlatformEventEnvelope): ClickHouseAgentEventRow {
  const payload = event.payload;
  const toolSuccess = pickBoolean(payload, "tool_success", "toolSuccess");

  return {
    event_id: event.eventId,
    event_type: event.eventType,
    event_timestamp: event.eventTimestamp,
    session_id: event.sessionId,
    prompt_id: event.promptId ?? null,
    user_id: pickString(payload, "user_id", "userId") ?? "unknown_user",
    source: event.source,
    agent_type: pickString(payload, "agent_type", "agentType") ?? "claude_code",
    tool_name: pickString(payload, "tool_name", "toolName") ?? null,
    tool_success: toolSuccess === undefined ? null : toolSuccess ? 1 : 0,
    tool_duration_ms: pickNumber(payload, "tool_duration_ms", "toolDurationMs") ?? null,
    model: pickString(payload, "model", "model") ?? null,
    cost_usd: pickNumber(payload, "cost_usd", "costUsd") ?? null,
    input_tokens: pickNumber(payload, "input_tokens", "inputTokens") ?? null,
    output_tokens: pickNumber(payload, "output_tokens", "outputTokens") ?? null,
    api_duration_ms: pickNumber(payload, "api_duration_ms", "apiDurationMs") ?? null,
    lines_added: pickNumber(payload, "lines_added", "linesAdded") ?? null,
    lines_removed: pickNumber(payload, "lines_removed", "linesRemoved") ?? null,
    files_changed: pickStringArray(payload, "files_changed", "filesChanged"),
    commit_sha: pickString(payload, "commit_sha", "commitSha") ?? null,
    attributes: buildAttributes(event)
  };
}

export class ClickHouseEventWriter {
  private readonly tableName: string;
  private readonly client: ClickHouseInsertClient<ClickHouseAgentEventRow>;

  public constructor(
    client: ClickHouseInsertClient<ClickHouseAgentEventRow>,
    options: ClickHouseEventWriterOptions = {}
  ) {
    this.client = client;
    this.tableName = options.tableName ?? DEFAULT_TABLE_NAME;
  }

  public async writeEvent(event: PlatformEventEnvelope): Promise<ClickHouseWriteSummary> {
    return this.writeEvents([event]);
  }

  public async writeEvents(events: readonly PlatformEventEnvelope[]): Promise<ClickHouseWriteSummary> {
    if (events.length === 0) {
      return {
        tableName: this.tableName,
        writtenRows: 0
      };
    }

    const rows = events.map(toClickHouseAgentEventRow);
    await this.client.insertJsonEachRow({
      table: this.tableName,
      rows
    });

    return {
      tableName: this.tableName,
      writtenRows: rows.length
    };
  }
}
