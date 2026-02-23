import assert from "node:assert/strict";
import test from "node:test";

import { createInMemoryRuntime } from "../src";
import { createRuntimeEnvelope } from "../src/samples";

test("runtime wires collector ingest into api session query", () => {
  const runtime = createInMemoryRuntime(Date.parse("2026-02-23T10:00:00.000Z"));
  const envelope = createRuntimeEnvelope({
    sessionId: "sess_runtime_test",
    eventId: "evt_runtime_test_1",
    eventType: "user_prompt"
  });

  const ingest = runtime.handleCollectorRaw({
    method: "POST",
    url: "/v1/hooks",
    rawBody: JSON.stringify(envelope)
  });
  assert.equal(ingest.statusCode, 202);

  const list = runtime.handleApiRaw({
    method: "GET",
    url: "/v1/sessions"
  });
  assert.equal(list.statusCode, 200);
  assert.equal(list.payload.status, "ok");
  if (list.payload.status === "ok" && "sessions" in list.payload) {
    assert.equal(list.payload.count, 1);
    assert.equal(list.payload.sessions[0]?.sessionId, "sess_runtime_test");
  } else {
    assert.fail("expected session list payload");
  }

  const detail = runtime.handleApiRaw({
    method: "GET",
    url: "/v1/sessions/sess_runtime_test"
  });
  assert.equal(detail.statusCode, 200);
  assert.equal(detail.payload.status, "ok");
  if (detail.payload.status === "ok" && "session" in detail.payload) {
    assert.equal(detail.payload.session.timeline.length, 1);
    assert.equal(detail.payload.session.metrics.promptCount, 1);
  } else {
    assert.fail("expected session detail payload");
  }
});

test("runtime collector dedupe prevents duplicate projections", () => {
  const runtime = createInMemoryRuntime();
  const envelope = createRuntimeEnvelope({
    sessionId: "sess_runtime_dupe",
    eventId: "evt_runtime_dupe"
  });

  runtime.handleCollectorRaw({
    method: "POST",
    url: "/v1/hooks",
    rawBody: JSON.stringify(envelope)
  });
  runtime.handleCollectorRaw({
    method: "POST",
    url: "/v1/hooks",
    rawBody: JSON.stringify(envelope)
  });

  const detail = runtime.handleApiRaw({
    method: "GET",
    url: "/v1/sessions/sess_runtime_dupe"
  });
  assert.equal(detail.statusCode, 200);
  assert.equal(detail.payload.status, "ok");
  if (detail.payload.status === "ok" && "session" in detail.payload) {
    assert.equal(detail.payload.session.timeline.length, 1);
  } else {
    assert.fail("expected detail payload");
  }
});

