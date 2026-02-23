import assert from "node:assert/strict";
import test from "node:test";

import { createRuntimeEnvelope } from "../src/samples";
import { projectEnvelopeToTrace } from "../src/projector";

test("projector creates base trace from first envelope", () => {
  const envelope = createRuntimeEnvelope({
    sessionId: "sess_001",
    eventId: "evt_001"
  });

  const trace = projectEnvelopeToTrace(undefined, envelope);
  assert.equal(trace.sessionId, "sess_001");
  assert.equal(trace.timeline.length, 1);
  assert.equal(trace.metrics.toolCallCount, 1);
  assert.equal(trace.metrics.totalCostUsd, 0.1);
});

test("projector increments metrics and avoids duplicate timeline events", () => {
  const firstEnvelope = createRuntimeEnvelope({
    sessionId: "sess_001",
    eventId: "evt_001",
    eventType: "tool_result",
    payload: {
      tool_name: "Edit",
      cost_usd: 0.2,
      input_tokens: 10,
      output_tokens: 5
    }
  });

  const firstTrace = projectEnvelopeToTrace(undefined, firstEnvelope);
  const secondTraceSameEvent = projectEnvelopeToTrace(firstTrace, firstEnvelope);
  assert.equal(secondTraceSameEvent.timeline.length, 1);
  assert.equal(secondTraceSameEvent.metrics.totalCostUsd, 0.2);

  const secondEnvelope = createRuntimeEnvelope({
    sessionId: "sess_001",
    eventId: "evt_002",
    eventType: "session_end",
    payload: {
      cost_usd: 0.3,
      model: "claude-sonnet"
    }
  });

  const merged = projectEnvelopeToTrace(secondTraceSameEvent, secondEnvelope);
  assert.equal(merged.timeline.length, 2);
  assert.equal(merged.endedAt, secondEnvelope.eventTimestamp);
  assert.equal(merged.metrics.totalCostUsd, 0.5);
  assert.ok(merged.metrics.modelsUsed.includes("claude-sonnet"));
});

