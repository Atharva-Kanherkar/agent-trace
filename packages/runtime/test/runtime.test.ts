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

test("runtime persists accepted events into clickhouse and postgres snapshots", () => {
  const runtime = createInMemoryRuntime();
  const envelope = createRuntimeEnvelope({
    sessionId: "sess_runtime_persist",
    eventId: "evt_runtime_persist_1",
    eventType: "tool_result",
    payload: {
      user_id: "user_runtime_persist",
      tool_name: "Edit",
      commit_sha: "sha_runtime_persist_1",
      commit_message: "feat: persist runtime"
    }
  });

  const ingest = runtime.handleCollectorRaw({
    method: "POST",
    url: "/v1/hooks",
    rawBody: JSON.stringify(envelope)
  });
  assert.equal(ingest.statusCode, 202);

  const snapshot = runtime.persistence.getSnapshot();
  assert.equal(snapshot.writeFailures.length, 0);
  assert.equal(snapshot.clickHouseRows.length, 1);
  assert.equal(snapshot.clickHouseSessionTraceRows.length, 1);
  assert.equal(snapshot.postgresSessionRows.length, 1);
  assert.equal(snapshot.postgresCommitRows.length, 1);
  assert.equal(snapshot.clickHouseRows[0]?.event_id, "evt_runtime_persist_1");
  assert.equal(snapshot.clickHouseSessionTraceRows[0]?.session_id, "sess_runtime_persist");
  assert.equal(snapshot.postgresSessionRows[0]?.session_id, "sess_runtime_persist");
  assert.equal(snapshot.postgresCommitRows[0]?.sha, "sha_runtime_persist_1");
});

test("runtime dedupe prevents duplicate persistence writes for same event id", () => {
  const runtime = createInMemoryRuntime();
  const envelope = createRuntimeEnvelope({
    sessionId: "sess_runtime_persist_dupe",
    eventId: "evt_runtime_persist_dupe",
    eventType: "tool_result",
    payload: {
      user_id: "user_runtime_persist_dupe",
      commit_sha: "sha_runtime_persist_dupe"
    }
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

  const snapshot = runtime.persistence.getSnapshot();
  assert.equal(snapshot.clickHouseRows.length, 1);
  assert.equal(snapshot.clickHouseSessionTraceRows.length, 1);
  assert.equal(snapshot.postgresSessionRows.length, 1);
  assert.equal(snapshot.postgresCommitRows.length, 1);
});
