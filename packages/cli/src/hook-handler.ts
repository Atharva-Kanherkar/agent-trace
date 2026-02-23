import crypto from "node:crypto";

import type { EventEnvelope } from "../../schema/src/types";
import { FileCliConfigStore } from "./config-store";
import type {
  CliConfigStore,
  HookHandlerInput,
  HookHandlerResult,
  HookPayload,
  PrivacyTier
} from "./types";

function isIsoDate(value: string): boolean {
  if (Number.isNaN(Date.parse(value))) {
    return false;
  }
  return value.endsWith("Z") || /[+-]\d{2}:\d{2}$/.test(value);
}

function parseHookPayload(rawStdin: string): HookPayload | undefined {
  const trimmed = rawStdin.trim();
  if (trimmed.length === 0) {
    return undefined;
  }

  const parsed = JSON.parse(trimmed) as unknown;
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return undefined;
  }

  return parsed as HookPayload;
}

function stableStringify(payload: HookPayload): string {
  const keys = Object.keys(payload).sort();
  const record: Record<string, unknown> = {};
  keys.forEach((key) => {
    record[key] = payload[key];
  });
  return JSON.stringify(record);
}

function buildEventId(payload: HookPayload, now: string): string {
  const material = `${now}:${stableStringify(payload)}`;
  return crypto.createHash("sha256").update(material).digest("hex");
}

function pickSessionId(payload: HookPayload): string {
  const fromSnake = payload["session_id"];
  if (typeof fromSnake === "string" && fromSnake.length > 0) {
    return fromSnake;
  }

  const fromCamel = payload["sessionId"];
  if (typeof fromCamel === "string" && fromCamel.length > 0) {
    return fromCamel;
  }

  return "unknown_session";
}

function pickPromptId(payload: HookPayload): string | undefined {
  const fromSnake = payload["prompt_id"];
  if (typeof fromSnake === "string" && fromSnake.length > 0) {
    return fromSnake;
  }

  const fromCamel = payload["promptId"];
  if (typeof fromCamel === "string" && fromCamel.length > 0) {
    return fromCamel;
  }

  return undefined;
}

function pickEventType(payload: HookPayload): string {
  const event = payload["event"];
  if (typeof event === "string" && event.length > 0) {
    return event;
  }
  const type = payload["type"];
  if (typeof type === "string" && type.length > 0) {
    return type;
  }
  const hook = payload["hook"];
  if (typeof hook === "string" && hook.length > 0) {
    return hook;
  }
  return "hook_event";
}

function pickTimestamp(payload: HookPayload, now: string): string {
  const value = payload["timestamp"];
  if (typeof value === "string" && value.length > 0) {
    return value;
  }
  return now;
}

function getPrivacyTier(store: CliConfigStore, configDir?: string): PrivacyTier {
  const config = store.readConfig(configDir);
  if (config === undefined) {
    return 1;
  }
  return config.privacyTier;
}

function toEnvelope(
  payload: HookPayload,
  privacyTier: PrivacyTier,
  now: string
): EventEnvelope<HookPayload> {
  const promptId = pickPromptId(payload);
  const eventType = pickEventType(payload);

  const envelope: EventEnvelope<HookPayload> = {
    schemaVersion: "1.0",
    source: "hook",
    sourceVersion: "agent-trace-cli-v0.1",
    eventId: buildEventId(payload, now),
    sessionId: pickSessionId(payload),
    ...(promptId !== undefined ? { promptId } : {}),
    eventType,
    eventTimestamp: pickTimestamp(payload, now),
    ingestedAt: now,
    privacyTier,
    payload,
    attributes: {
      hook_name: eventType
    }
  };

  return envelope;
}

function validateEnvelope(envelope: EventEnvelope<HookPayload>): readonly string[] {
  const errors: string[] = [];

  if (envelope.schemaVersion !== "1.0") {
    errors.push("schemaVersion must equal 1.0");
  }
  if (envelope.source !== "hook") {
    errors.push("source must equal hook");
  }
  if (envelope.eventId.length === 0) {
    errors.push("eventId must be non-empty");
  }
  if (envelope.sessionId.length === 0) {
    errors.push("sessionId must be non-empty");
  }
  if (envelope.eventType.length === 0) {
    errors.push("eventType must be non-empty");
  }
  if (!isIsoDate(envelope.eventTimestamp)) {
    errors.push("eventTimestamp must be ISO-8601");
  }
  if (!isIsoDate(envelope.ingestedAt)) {
    errors.push("ingestedAt must be ISO-8601");
  }
  if (envelope.privacyTier !== 1 && envelope.privacyTier !== 2 && envelope.privacyTier !== 3) {
    errors.push("privacyTier must be 1, 2, or 3");
  }

  return errors;
}

export function runHookHandler(
  input: HookHandlerInput,
  store: CliConfigStore = new FileCliConfigStore()
): HookHandlerResult {
  let payload: HookPayload | undefined;
  try {
    payload = parseHookPayload(input.rawStdin);
  } catch {
    return {
      ok: false,
      errors: ["hook payload is not valid JSON"]
    };
  }

  if (payload === undefined) {
    return {
      ok: false,
      errors: ["hook payload is empty or invalid"]
    };
  }

  const now = input.nowIso ?? new Date().toISOString();
  const privacyTier = getPrivacyTier(store, input.configDir);
  const envelope = toEnvelope(payload, privacyTier, now);
  const errors = validateEnvelope(envelope);
  if (errors.length > 0) {
    return {
      ok: false,
      errors
    };
  }

  return {
    ok: true,
    envelope
  };
}
