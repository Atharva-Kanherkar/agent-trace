import crypto from "node:crypto";

import type { EventEnvelope } from "../../schema/src/types";
import type {
  OtelNormalizeFailure,
  OtelNormalizeInput,
  OtelNormalizeResult,
  OtelNormalizeSuccess,
  TranscriptEventPayload
} from "./types";

type UnknownRecord = Record<string, unknown>;
type Primitive = string | number | boolean;

function asRecord(value: unknown): UnknownRecord | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }
  return value as UnknownRecord;
}

function asArray(value: unknown): readonly unknown[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value;
}

function pickString(record: UnknownRecord, keys: readonly string[]): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.length > 0) {
      return value;
    }
  }
  return undefined;
}

function pickNumber(record: UnknownRecord, keys: readonly string[]): number | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
  }
  return undefined;
}

function mergeRecordIntoPayload(target: Record<string, unknown>, source: UnknownRecord): void {
  Object.entries(source).forEach(([key, value]) => {
    if (typeof value === "string" || (typeof value === "number" && Number.isFinite(value)) || typeof value === "boolean") {
      target[key] = value;
    }
  });
}

function extractPrimitiveFromAnyValue(value: unknown): Primitive | undefined {
  const record = asRecord(value);
  if (record === undefined) {
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      return value;
    }
    return undefined;
  }

  const stringValue = record["stringValue"];
  if (typeof stringValue === "string") {
    return stringValue;
  }

  const boolValue = record["boolValue"];
  if (typeof boolValue === "boolean") {
    return boolValue;
  }

  const intValue = record["intValue"];
  if (typeof intValue === "string" && intValue.length > 0) {
    const parsed = Number(intValue);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  if (typeof intValue === "number" && Number.isFinite(intValue)) {
    return intValue;
  }

  const doubleValue = record["doubleValue"];
  if (typeof doubleValue === "number" && Number.isFinite(doubleValue)) {
    return doubleValue;
  }

  return undefined;
}

function attributesToPayload(attributes: unknown): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  asArray(attributes).forEach((entry) => {
    const entryRecord = asRecord(entry);
    if (entryRecord === undefined) {
      return;
    }

    const key = entryRecord["key"];
    const value = extractPrimitiveFromAnyValue(entryRecord["value"]);
    if (typeof key !== "string" || key.length === 0 || value === undefined) {
      return;
    }

    values[key] = value;
  });

  return values;
}

function unixNanoToIso(value: string | number | undefined, fallbackIso: string): string {
  if (typeof value === "number" && Number.isFinite(value)) {
    const millis = Math.floor(value / 1_000_000);
    const iso = new Date(millis).toISOString();
    return Number.isNaN(Date.parse(iso)) ? fallbackIso : iso;
  }

  if (typeof value === "string" && value.length > 0) {
    try {
      const millis = Number(BigInt(value) / BigInt(1_000_000));
      if (Number.isFinite(millis)) {
        return new Date(millis).toISOString();
      }
    } catch {
      return fallbackIso;
    }
  }

  return fallbackIso;
}

function buildEventId(sessionId: string, eventTimestamp: string, eventType: string, salt: string): string {
  return crypto
    .createHash("sha256")
    .update(`${sessionId}:${eventTimestamp}:${eventType}:${salt}`)
    .digest("hex");
}

function normalizeLogRecord(
  logRecord: unknown,
  input: OtelNormalizeInput,
  salt: string
): EventEnvelope<TranscriptEventPayload> | undefined {
  const logRecordObject = asRecord(logRecord);
  if (logRecordObject === undefined) {
    return undefined;
  }

  const ingestedAt = input.ingestedAt ?? new Date().toISOString();
  const payload = attributesToPayload(logRecordObject["attributes"]);

  const body = extractPrimitiveFromAnyValue(logRecordObject["body"]);
  if (body !== undefined) {
    payload["body"] = body;
    if (typeof body === "string" && body.trim().startsWith("{")) {
      try {
        const parsedBody = JSON.parse(body) as unknown;
        const bodyRecord = asRecord(parsedBody);
        if (bodyRecord !== undefined) {
          mergeRecordIntoPayload(payload, bodyRecord);
        }
      } catch {
        // body can be non-JSON text; keep as-is
      }
    }
  }

  const severityText = pickString(logRecordObject, ["severityText"]);
  if (severityText !== undefined) {
    payload["severity_text"] = severityText;
  }
  const severityNumber = pickNumber(logRecordObject, ["severityNumber"]);
  if (severityNumber !== undefined) {
    payload["severity_number"] = severityNumber;
  }

  const eventType = pickString(payload as UnknownRecord, ["event_type", "event.name", "event.type", "type"]) ?? "otel_log";
  const sessionId =
    pickString(payload as UnknownRecord, ["session_id", "session.id", "sessionId"]) ?? "unknown_session";
  const promptId = pickString(payload as UnknownRecord, ["prompt_id", "prompt.id", "promptId"]);
  const eventTimestamp = unixNanoToIso(
    pickString(logRecordObject, ["timeUnixNano"]) ?? pickNumber(logRecordObject, ["timeUnixNano"]),
    ingestedAt
  );

  return {
    schemaVersion: "1.0",
    source: "otel",
    sourceVersion: "otlp-log-v1",
    eventId: buildEventId(sessionId, eventTimestamp, eventType, salt),
    sessionId,
    ...(promptId !== undefined ? { promptId } : {}),
    eventType,
    eventTimestamp,
    ingestedAt,
    privacyTier: input.privacyTier,
    payload
  };
}

function collectLogRecords(payload: unknown): readonly unknown[] {
  const root = asRecord(payload);
  if (root === undefined) {
    return [];
  }

  const resourceLogs = asArray(root["resourceLogs"]);
  const collected: unknown[] = [];
  resourceLogs.forEach((resourceLog) => {
    const resourceRecord = asRecord(resourceLog);
    if (resourceRecord === undefined) {
      return;
    }

    const scopeLogs = asArray(resourceRecord["scopeLogs"]);
    const instrumentationLibraryLogs = asArray(resourceRecord["instrumentationLibraryLogs"]);
    [...scopeLogs, ...instrumentationLibraryLogs].forEach((scopeEntry) => {
      const scopeRecord = asRecord(scopeEntry);
      if (scopeRecord === undefined) {
        return;
      }

      const logRecords = asArray(scopeRecord["logRecords"]);
      logRecords.forEach((logRecord) => {
        collected.push(logRecord);
      });
    });
  });

  return collected;
}

export function normalizeOtelExport(input: OtelNormalizeInput): OtelNormalizeResult {
  const logRecords = collectLogRecords(input.payload);
  const events: EventEnvelope<TranscriptEventPayload>[] = [];
  const errors: string[] = [];
  let droppedRecords = 0;

  if (logRecords.length === 0) {
    return {
      ok: false,
      events: [],
      droppedRecords: 0,
      errors: ["payload does not contain OTEL log records"]
    };
  }

  logRecords.forEach((record, index) => {
    const envelope = normalizeLogRecord(record, input, String(index + 1));
    if (envelope === undefined) {
      droppedRecords += 1;
      errors.push(`log record ${String(index + 1)} is invalid`);
      return;
    }
    events.push(envelope);
  });

  if (errors.length > 0) {
    const failure: OtelNormalizeFailure = {
      ok: false,
      events,
      droppedRecords,
      errors
    };
    return failure;
  }

  const success: OtelNormalizeSuccess = {
    ok: true,
    events,
    droppedRecords,
    errors: []
  };
  return success;
}
