import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { toDeterministicUuid } from "../../platform/src/clickhouse-uuid";
import { createInMemoryRuntime } from "../src";
import { createRuntimeEnvelope } from "../src/samples";

function createTempTranscriptFile(content: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-trace-runtime-transcript-"));
  const filePath = path.join(dir, "session.jsonl");
  fs.writeFileSync(filePath, content, "utf8");
  return filePath;
}

test("runtime wires collector ingest into api session query", async () => {
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

  const list = await runtime.handleApiRaw({
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

  const detail = await runtime.handleApiRaw({
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

test("runtime collector dedupe prevents duplicate projections", async () => {
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

  const detail = await runtime.handleApiRaw({
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
  assert.equal(snapshot.clickHouseRows[0]?.event_id, toDeterministicUuid("evt_runtime_persist_1"));
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

test("runtime ingests transcript payload on stop hook and projects prompt/token metrics", async () => {
  const runtime = createInMemoryRuntime(Date.parse("2026-02-24T11:19:00.000Z"));
  const transcriptPath = createTempTranscriptFile(
    `${JSON.stringify({
      sessionId: "sess_runtime_transcript",
      type: "user",
      timestamp: "2026-02-24T11:19:37.000Z",
      uuid: "uuid_user_1",
      message: {
        role: "user",
        content: "hello from transcript"
      }
    })}\n${JSON.stringify({
      sessionId: "sess_runtime_transcript",
      type: "assistant",
      timestamp: "2026-02-24T11:19:40.000Z",
      requestId: "req_runtime_transcript_1",
      message: {
        id: "msg_runtime_transcript_1",
        model: "claude-opus-4-6",
        role: "assistant",
        content: [{ type: "text", text: "response" }],
        usage: {
          input_tokens: 7,
          output_tokens: 11,
          cache_read_input_tokens: 13
        }
      }
    })}\n`
  );

  try {
    const ingest = runtime.handleCollectorRaw({
      method: "POST",
      url: "/v1/hooks",
      rawBody: JSON.stringify(
        createRuntimeEnvelope({
          sessionId: "sess_runtime_transcript",
          eventId: "evt_runtime_transcript_stop",
          eventType: "Stop",
          eventTimestamp: "2026-02-24T11:19:45.000Z",
          privacyTier: 2,
          payload: {
            user_id: "user_runtime_transcript",
            transcript_path: transcriptPath
          }
        })
      )
    });
    assert.equal(ingest.statusCode, 202);

    await new Promise<void>((resolve) => {
      setTimeout(() => resolve(), 10);
    });

    const detail = await runtime.handleApiRaw({
      method: "GET",
      url: "/v1/sessions/sess_runtime_transcript"
    });
    assert.equal(detail.statusCode, 200);
    assert.equal(detail.payload.status, "ok");
    if (detail.payload.status === "ok" && "session" in detail.payload) {
      assert.equal(detail.payload.session.metrics.promptCount, 1);
      assert.equal(detail.payload.session.metrics.totalInputTokens, 7);
      assert.equal(detail.payload.session.metrics.totalOutputTokens, 11);
      assert.equal(detail.payload.session.metrics.modelsUsed.includes("claude-opus-4-6"), true);
      assert.equal(detail.payload.session.timeline.length >= 3, true);

      const promptEvent = detail.payload.session.timeline.find(
        (event: { type: string }) => event.type === "user_prompt"
      );
      assert.notEqual(promptEvent, undefined, "expected a user_prompt timeline event");
      assert.notEqual(promptEvent?.details, undefined, "expected user_prompt to have details");
      assert.equal(promptEvent?.details?.["promptText"], "hello from transcript");

      const responseEvent = detail.payload.session.timeline.find(
        (event: { type: string }) => event.type === "api_response"
      );
      assert.notEqual(responseEvent, undefined, "expected an api_response timeline event");
      assert.notEqual(responseEvent?.details, undefined, "expected api_response to have details");
      assert.equal(responseEvent?.details?.["responseText"], "response");
      assert.equal(responseEvent?.details?.["model"], "claude-opus-4-6");
    } else {
      assert.fail("expected session detail payload");
    }

    const snapshot = runtime.persistence.getSnapshot();
    const transcriptRows = snapshot.clickHouseRows.filter(
      (row) => row.attributes["event_id_raw"] !== undefined && row.event_type !== "Stop"
    );
    assert.equal(transcriptRows.length >= 2, true, "expected transcript events in clickhouse");
    const promptRow = transcriptRows.find((row) => row.event_type === "user_prompt");
    assert.notEqual(promptRow, undefined, "expected user_prompt row in clickhouse");
    assert.equal(promptRow?.attributes["prompt_text"], "hello from transcript");
    const responseRow = transcriptRows.find((row) => row.event_type === "api_response");
    assert.notEqual(responseRow, undefined, "expected api_response row in clickhouse");
    assert.equal(responseRow?.attributes["response_text"], "response");
  } finally {
    fs.rmSync(path.dirname(transcriptPath), { recursive: true, force: true });
  }
});
