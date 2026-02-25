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

test("projector creates commit only when is_commit flag is set", () => {
  const commitEnvelope = createRuntimeEnvelope({
    sessionId: "sess_commit_001",
    eventId: "evt_commit_001",
    promptId: "prompt_commit_001",
    eventType: "tool_result",
    payload: {
      tool_name: "Bash",
      commit_sha: "abc123",
      commit_message: "feat: add new feature",
      is_commit: true,
      lines_added: 15,
      lines_removed: 3,
      cost_usd: 0.05,
      input_tokens: 50,
      output_tokens: 10
    }
  });

  const trace = projectEnvelopeToTrace(undefined, commitEnvelope);
  assert.equal(trace.git.commits.length, 1);
  assert.equal(trace.git.commits[0]?.sha, "abc123");
  assert.equal(trace.git.commits[0]?.message, "feat: add new feature");
  assert.equal(trace.git.commits[0]?.promptId, "prompt_commit_001");
  assert.equal(trace.git.commits[0]?.linesAdded, 15);
  assert.equal(trace.git.commits[0]?.linesRemoved, 3);
});

test("projector ignores commit_sha from session_end events without is_commit", () => {
  const sessionEndEnvelope = createRuntimeEnvelope({
    sessionId: "sess_no_commit_001",
    eventId: "evt_end_001",
    eventType: "session_end",
    payload: {
      commit_sha: "deadbeef",
      lines_added: 20,
      lines_removed: 5,
      cost_usd: 0
    }
  });

  const trace = projectEnvelopeToTrace(undefined, sessionEndEnvelope);
  assert.equal(trace.git.commits.length, 0);
});

test("projector creates commit when commit_message is present for backward compatibility", () => {
  const legacyEnvelope = createRuntimeEnvelope({
    sessionId: "sess_legacy_001",
    eventId: "evt_legacy_001",
    promptId: "prompt_legacy_001",
    eventType: "tool_result",
    payload: {
      tool_name: "Bash",
      commit_sha: "legacy123",
      commit_message: "fix: legacy commit",
      cost_usd: 0.01,
      input_tokens: 10,
      output_tokens: 5
    }
  });

  const trace = projectEnvelopeToTrace(undefined, legacyEnvelope);
  assert.equal(trace.git.commits.length, 1);
  assert.equal(trace.git.commits[0]?.sha, "legacy123");
  assert.equal(trace.git.commits[0]?.message, "fix: legacy commit");
});

test("projector marks session as ended for SessionEnd alias", () => {
  const startEnvelope = createRuntimeEnvelope({
    sessionId: "sess_alias_end_001",
    eventId: "evt_alias_start_001",
    eventType: "tool_result"
  });
  const started = projectEnvelopeToTrace(undefined, startEnvelope);

  const endEnvelope = createRuntimeEnvelope({
    sessionId: "sess_alias_end_001",
    eventId: "evt_alias_end_001",
    eventType: "SessionEnd"
  });
  const ended = projectEnvelopeToTrace(started, endEnvelope);

  assert.equal(ended.endedAt, endEnvelope.eventTimestamp);
});
