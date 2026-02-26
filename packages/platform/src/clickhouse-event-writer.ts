import type {
  ClickHouseAgentEventRow,
  ClickHouseEventWriterOptions,
  ClickHouseInsertClient,
  ClickHouseWriteSummary,
  PlatformEventEnvelope,
  PlatformEventPayload
} from "./persistence-types";
import { toClickHouseDateTime64 } from "./clickhouse-datetime";
import { toDeterministicUuid } from "./clickhouse-uuid";

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
  const payload = event.payload;

  if (event.attributes !== undefined) {
    Object.keys(event.attributes).forEach((key) => {
      const value = event.attributes?.[key];
      if (typeof value === "string") {
        attributes[key] = value;
      }
    });
  }

  attributes["privacy_tier"] = String(event.privacyTier);
  attributes["event_id_raw"] = event.eventId;
  if (event.sourceVersion !== undefined) {
    attributes["source_version"] = event.sourceVersion;
  }
  if (event.privacyTier >= 2) {
    const promptText = pickString(payload, "prompt_text", "promptText");
    if (promptText !== undefined) {
      attributes["prompt_text"] = promptText;
    }
    const command = pickString(payload, "command", "command");
    if (command !== undefined) {
      attributes["command"] = command;
    }
    const toolInput = pickUnknown(payload, "tool_input", "toolInput");
    if (toolInput !== undefined) {
      const inputRecord = typeof toolInput === "object" && toolInput !== null && !Array.isArray(toolInput)
        ? toolInput as Record<string, unknown>
        : undefined;

      const filePath = inputRecord !== undefined
        ? (typeof inputRecord["file_path"] === "string" ? inputRecord["file_path"]
          : typeof inputRecord["filePath"] === "string" ? inputRecord["filePath"] : undefined)
        : undefined;
      if (filePath !== undefined) {
        attributes["file_path"] = filePath;
      }

      const toolName = pickString(payload, "tool_name", "toolName");

      if (toolName === "Edit" && inputRecord !== undefined) {
        const oldStr = typeof inputRecord["old_string"] === "string" ? inputRecord["old_string"] : undefined;
        const newStr = typeof inputRecord["new_string"] === "string" ? inputRecord["new_string"] : undefined;
        if (oldStr !== undefined) {
          attributes["old_string"] = oldStr.length > 2000 ? oldStr.slice(0, 1997) + "..." : oldStr;
        }
        if (newStr !== undefined) {
          attributes["new_string"] = newStr.length > 2000 ? newStr.slice(0, 1997) + "..." : newStr;
        }
      }

      if (toolName === "Write" && inputRecord !== undefined) {
        const content = typeof inputRecord["content"] === "string" ? inputRecord["content"] : undefined;
        if (content !== undefined) {
          attributes["write_content"] = content.length > 5000 ? content.slice(0, 4997) + "..." : content;
        }
      }

      const serialized = typeof toolInput === "string" ? toolInput : JSON.stringify(toolInput);
      attributes["tool_input"] = serialized.length > 500 ? serialized.slice(0, 497) + "..." : serialized;
    }
    const responseText = pickString(payload, "response_text", "responseText");
    if (responseText !== undefined) {
      attributes["response_text"] = responseText.length > 2000 ? responseText.slice(0, 1997) + "..." : responseText;
    }
  }

  return attributes;
}

export function toClickHouseAgentEventRow(event: PlatformEventEnvelope): ClickHouseAgentEventRow {
  const payload = event.payload;
  const toolSuccess = pickBoolean(payload, "tool_success", "toolSuccess");

  return {
    event_id: toDeterministicUuid(event.eventId),
    event_type: event.eventType,
    event_timestamp: toClickHouseDateTime64(event.eventTimestamp),
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
    cache_read_tokens: pickNumber(payload, "cache_read_tokens", "cacheReadTokens") ?? pickNumber(payload, "cache_read_input_tokens", "cacheReadInputTokens") ?? null,
    cache_write_tokens: pickNumber(payload, "cache_write_tokens", "cacheWriteTokens") ?? pickNumber(payload, "cache_creation_input_tokens", "cacheCreationInputTokens") ?? null,
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
