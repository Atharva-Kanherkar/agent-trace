import assert from "node:assert/strict";
import test from "node:test";

import { createInMemoryRuntime, createRuntimeOtelSink } from "../src/runtime";
import { createRuntimeEnvelope } from "../src/samples";

test("runtime otel sink ingests events through shared dedupe projection and persistence path", async () => {
  const runtime = createInMemoryRuntime();
  const sink = createRuntimeOtelSink(runtime);
  const event = createRuntimeEnvelope({
    sessionId: "sess_runtime_otel_sink",
    eventId: "evt_runtime_otel_sink",
    eventType: "tool_result",
    payload: {
      user_id: "user_runtime_otel_sink",
      tool_name: "Read"
    }
  });

  await sink.ingestOtelEvents([event]);
  await sink.ingestOtelEvents([event]);

  const session = runtime.sessionRepository.getBySessionId("sess_runtime_otel_sink");
  assert.notEqual(session, undefined);
  assert.equal(session?.timeline.length, 1);

  const snapshot = runtime.persistence.getSnapshot();
  assert.equal(snapshot.clickHouseRows.length, 1);
  assert.equal(snapshot.postgresSessionRows.length, 1);
});
