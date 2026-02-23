import type { RuntimeEnvelope } from "./types";

export function createRuntimeEnvelope(overrides: Partial<RuntimeEnvelope> = {}): RuntimeEnvelope {
  return {
    schemaVersion: "1.0",
    source: "hook",
    sourceVersion: "runtime-sample",
    eventId: "evt_runtime_001",
    sessionId: "sess_runtime_001",
    promptId: "prompt_runtime_001",
    eventType: "tool_result",
    eventTimestamp: "2026-02-23T12:00:00.000Z",
    ingestedAt: "2026-02-23T12:00:01.000Z",
    privacyTier: 1,
    payload: {
      tool_name: "Read",
      cost_usd: 0.1,
      input_tokens: 100,
      output_tokens: 25
    },
    attributes: {
      hook_name: "tool_result"
    },
    ...overrides
  };
}

