import crypto from "node:crypto";
import fs from "node:fs";

import type { EventEnvelope } from "../../schema/src/types";
import type {
  TranscriptEventPayload,
  TranscriptParseFailure,
  TranscriptParseInput,
  TranscriptParseResult,
  TranscriptParseSuccess
} from "./types";

type UnknownRecord = Record<string, unknown>;

function isIsoDate(value: string): boolean {
  if (Number.isNaN(Date.parse(value))) {
    return false;
  }

  return value.endsWith("Z") || /[+-]\d{2}:\d{2}$/.test(value);
}

function asRecord(value: unknown): UnknownRecord | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }

  return value as UnknownRecord;
}

function asArray(value: unknown): readonly unknown[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  return value;
}

function readString(record: UnknownRecord, keys: readonly string[]): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.length > 0) {
      return value;
    }
  }

  return undefined;
}

function readNumber(record: UnknownRecord | undefined, keys: readonly string[]): number | undefined {
  if (record === undefined) {
    return undefined;
  }

  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === "string" && value.length > 0) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }

  return undefined;
}

function buildEventId(filePath: string, lineNumber: number, rawLine: string): string {
  return crypto.createHash("sha256").update(`${filePath}:${String(lineNumber)}:${rawLine}`).digest("hex");
}

function readMessageRecord(record: UnknownRecord): UnknownRecord | undefined {
  return asRecord(record["message"]);
}

function findMessageContentRecordByType(
  message: UnknownRecord | undefined,
  contentType: string
): UnknownRecord | undefined {
  if (message === undefined) {
    return undefined;
  }

  const content = asArray(message["content"]);
  if (content === undefined) {
    return undefined;
  }

  for (const item of content) {
    const contentRecord = asRecord(item);
    if (contentRecord === undefined) {
      continue;
    }

    const type = readString(contentRecord, ["type"]);
    if (type === contentType) {
      return contentRecord;
    }
  }

  return undefined;
}

function hasMessageContentType(message: UnknownRecord | undefined, contentType: string): boolean {
  return findMessageContentRecordByType(message, contentType) !== undefined;
}

function readPromptText(message: UnknownRecord | undefined): string | undefined {
  if (message === undefined) {
    return undefined;
  }

  const content = message["content"];
  if (typeof content === "string" && content.length > 0) {
    return content;
  }

  const contentItems = asArray(content);
  if (contentItems === undefined) {
    return undefined;
  }

  for (const item of contentItems) {
    const contentRecord = asRecord(item);
    if (contentRecord === undefined) {
      continue;
    }

    const text = readString(contentRecord, ["text", "content"]);
    if (text !== undefined) {
      return text;
    }
  }

  return undefined;
}

function normalizeEventType(record: UnknownRecord, message: UnknownRecord | undefined): string {
  const explicitEventType = readString(record, ["event", "kind"]);
  if (explicitEventType !== undefined) {
    return explicitEventType;
  }

  const transcriptType = readString(record, ["type"]);
  if (transcriptType === undefined) {
    return "transcript_event";
  }

  if (transcriptType === "user") {
    const role = message !== undefined ? readString(message, ["role"]) : undefined;
    if (role === "user") {
      if (hasMessageContentType(message, "tool_result")) {
        return "tool_result";
      }
      return "user_prompt";
    }
    return "user_event";
  }

  if (transcriptType === "assistant") {
    if (hasMessageContentType(message, "tool_use")) {
      return "api_tool_use";
    }
    return "api_response";
  }

  if (transcriptType === "progress") {
    const data = asRecord(record["data"]);
    const hookEvent = data !== undefined ? readString(data, ["hookEvent", "hook_event"]) : undefined;
    if (hookEvent !== undefined) {
      return hookEvent;
    }
    return "progress";
  }

  if (transcriptType === "system") {
    return readString(record, ["subtype"]) ?? "system_event";
  }

  return transcriptType;
}

function buildNormalizedPayload(
  record: UnknownRecord,
  message: UnknownRecord | undefined,
  eventType: string
): TranscriptEventPayload {
  const payload: Record<string, unknown> = {
    ...record,
    normalized_event_type: eventType
  };

  const userId = readString(record, ["user_id", "userId", "userType"]);
  if (userId !== undefined) {
    payload["user_id"] = userId;
  }

  const projectPath = readString(record, ["project_path", "projectPath", "cwd"]);
  if (projectPath !== undefined) {
    payload["project_path"] = projectPath;
  }

  const gitBranch = readString(record, ["git_branch", "gitBranch"]);
  if (gitBranch !== undefined) {
    payload["git_branch"] = gitBranch;
  }

  const model = (message !== undefined ? readString(message, ["model"]) : undefined) ?? readString(record, ["model"]);
  if (model !== undefined) {
    payload["model"] = model;
  }

  const requestId = readString(record, ["request_id", "requestId"]);
  if (requestId !== undefined) {
    payload["request_id"] = requestId;
  }

  const usage = asRecord(message?.["usage"]);
  const inputTokens = readNumber(usage, ["input_tokens", "inputTokens"]);
  if (inputTokens !== undefined) {
    payload["input_tokens"] = inputTokens;
  }
  const outputTokens = readNumber(usage, ["output_tokens", "outputTokens"]);
  if (outputTokens !== undefined) {
    payload["output_tokens"] = outputTokens;
  }
  const cacheReadTokens = readNumber(usage, ["cache_read_input_tokens", "cacheReadInputTokens"]);
  if (cacheReadTokens !== undefined) {
    payload["cache_read_tokens"] = cacheReadTokens;
  }

  const promptText = readPromptText(message);
  if (promptText !== undefined) {
    payload["prompt_text"] = promptText;
  }

  if (eventType === "api_response") {
    const responseText = readPromptText(message);
    if (responseText !== undefined) {
      payload["response_text"] = responseText;
    }
  }

  const toolUse = findMessageContentRecordByType(message, "tool_use");
  if (toolUse !== undefined) {
    const toolName = readString(toolUse, ["name"]);
    if (toolName !== undefined) {
      payload["tool_name"] = toolName;
    }

    const toolUseId = readString(toolUse, ["id", "tool_use_id", "toolUseId"]);
    if (toolUseId !== undefined) {
      payload["tool_use_id"] = toolUseId;
    }

    const toolInput = asRecord(toolUse["input"]);
    if (toolInput !== undefined) {
      payload["tool_input"] = toolInput;
    }
    const filePath = toolInput !== undefined ? readString(toolInput, ["file_path", "filePath"]) : undefined;
    if (filePath !== undefined) {
      payload["file_path"] = filePath;
    }
    const command = toolInput !== undefined ? readString(toolInput, ["command", "cmd"]) : undefined;
    if (command !== undefined) {
      payload["command"] = command;
    }
  }

  const toolResult = findMessageContentRecordByType(message, "tool_result");
  if (toolResult !== undefined) {
    const toolUseId = readString(toolResult, ["tool_use_id", "toolUseId"]);
    if (toolUseId !== undefined) {
      payload["tool_use_id"] = toolUseId;
    }
  }

  const data = asRecord(record["data"]);
  const hookEvent = data !== undefined ? readString(data, ["hookEvent", "hook_event"]) : undefined;
  if (hookEvent !== undefined) {
    payload["hook_event"] = hookEvent;
  }

  return payload;
}

function pickPromptId(record: UnknownRecord, message: UnknownRecord | undefined): string | undefined {
  return (
    readString(record, ["prompt_id", "promptId"]) ??
    (message !== undefined ? readString(message, ["id"]) : undefined) ??
    readString(record, ["requestId", "request_id", "messageId", "message_id", "uuid"])
  );
}

function buildEnvelope(
  record: UnknownRecord,
  filePath: string,
  lineNumber: number,
  rawLine: string,
  input: TranscriptParseInput
): EventEnvelope<TranscriptEventPayload> | undefined {
  const sessionId = readString(record, ["session_id", "sessionId"]) ?? input.sessionIdFallback;
  if (sessionId === undefined) {
    return undefined;
  }

  const message = readMessageRecord(record);
  const promptId = pickPromptId(record, message);
  const eventType = normalizeEventType(record, message);
  const payload = buildNormalizedPayload(record, message, eventType);

  const eventTimestampFromLine = readString(record, ["timestamp", "time", "created_at", "createdAt"]);
  const ingestedAt = input.ingestedAt ?? new Date().toISOString();
  const eventTimestamp = eventTimestampFromLine ?? ingestedAt;
  if (!isIsoDate(eventTimestamp) || !isIsoDate(ingestedAt)) {
    return undefined;
  }

  return {
    schemaVersion: "1.0",
    source: "transcript",
    sourceVersion: "claude-jsonl-v1",
    eventId: buildEventId(filePath, lineNumber, rawLine),
    sessionId,
    ...(promptId !== undefined ? { promptId } : {}),
    eventType,
    eventTimestamp,
    ingestedAt,
    privacyTier: input.privacyTier,
    payload,
    attributes: {
      transcript_file: filePath,
      transcript_line: String(lineNumber)
    }
  };
}

function parseLines(contents: string, input: TranscriptParseInput): TranscriptParseResult {
  const lines = contents.split("\n");
  const parsedEvents: EventEnvelope<TranscriptEventPayload>[] = [];
  const errors: string[] = [];
  let skippedLines = 0;

  lines.forEach((line, index) => {
    const lineNumber = index + 1;
    const trimmed = line.trim();
    if (trimmed.length === 0) {
      return;
    }

    let parsedUnknown: unknown;
    try {
      parsedUnknown = JSON.parse(trimmed);
    } catch {
      skippedLines += 1;
      errors.push(`line ${String(lineNumber)}: invalid JSON`);
      return;
    }

    const payload = asRecord(parsedUnknown);
    if (payload === undefined) {
      skippedLines += 1;
      errors.push(`line ${String(lineNumber)}: entry must be object`);
      return;
    }

    const envelope = buildEnvelope(payload, input.filePath, lineNumber, trimmed, input);
    if (envelope === undefined) {
      skippedLines += 1;
      errors.push(`line ${String(lineNumber)}: missing or invalid required transcript fields`);
      return;
    }

    parsedEvents.push(envelope);
  });

  if (errors.length > 0) {
    const failure: TranscriptParseFailure = {
      ok: false,
      filePath: input.filePath,
      parsedEvents,
      skippedLines,
      errors
    };
    return failure;
  }

  const success: TranscriptParseSuccess = {
    ok: true,
    filePath: input.filePath,
    parsedEvents,
    skippedLines,
    errors: []
  };
  return success;
}

export function parseTranscriptJsonl(input: TranscriptParseInput): TranscriptParseResult {
  if (!fs.existsSync(input.filePath)) {
    return {
      ok: false,
      filePath: input.filePath,
      parsedEvents: [],
      skippedLines: 0,
      errors: ["transcript file does not exist"]
    };
  }

  const raw = fs.readFileSync(input.filePath, "utf8");
  return parseLines(raw, input);
}
