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

function readString(record: UnknownRecord, keys: readonly string[]): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.length > 0) {
      return value;
    }
  }

  return undefined;
}

function buildEventId(filePath: string, lineNumber: number, rawLine: string): string {
  return crypto.createHash("sha256").update(`${filePath}:${String(lineNumber)}:${rawLine}`).digest("hex");
}

function buildEnvelope(
  payload: TranscriptEventPayload,
  filePath: string,
  lineNumber: number,
  rawLine: string,
  input: TranscriptParseInput
): EventEnvelope<TranscriptEventPayload> | undefined {
  const record = asRecord(payload);
  if (record === undefined) {
    return undefined;
  }

  const sessionId = readString(record, ["session_id", "sessionId"]) ?? input.sessionIdFallback;
  if (sessionId === undefined) {
    return undefined;
  }

  const promptId = readString(record, ["prompt_id", "promptId"]);
  const eventType = readString(record, ["event", "type", "kind"]) ?? "transcript_event";

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
