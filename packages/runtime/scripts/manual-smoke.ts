import { createInMemoryRuntime } from "../src";
import { createRuntimeEnvelope } from "../src/samples";

async function main(): Promise<void> {
  const runtime = createInMemoryRuntime();
  const envelope = createRuntimeEnvelope({
    sessionId: "sess_runtime_smoke",
    eventId: "evt_runtime_smoke_1",
    eventType: "tool_result",
    payload: {
      tool_name: "Read",
      cost_usd: 0.25,
      input_tokens: 40,
      output_tokens: 10
    }
  });

  const ingest = runtime.handleCollectorRaw({
    method: "POST",
    url: "/v1/hooks",
    rawBody: JSON.stringify(envelope)
  });
  if (ingest.statusCode !== 202 || ingest.payload.status !== "accepted") {
    throw new Error("runtime smoke failed: collector did not accept envelope");
  }

  const list = await runtime.handleApiRaw({
    method: "GET",
    url: "/v1/sessions"
  });
  if (list.statusCode !== 200 || list.payload.status !== "ok" || !("sessions" in list.payload)) {
    throw new Error("runtime smoke failed: expected session list payload");
  }

  const detail = await runtime.handleApiRaw({
    method: "GET",
    url: "/v1/sessions/sess_runtime_smoke"
  });
  if (detail.statusCode !== 200 || detail.payload.status !== "ok" || !("session" in detail.payload)) {
    throw new Error("runtime smoke failed: expected session detail payload");
  }

  console.log("runtime manual smoke passed");
  console.log(`sessionId=${detail.payload.session.sessionId}`);
  console.log(`timelineEvents=${detail.payload.session.timeline.length}`);
  const snapshot = runtime.persistence.getSnapshot();
  console.log(`persistedEventRows=${snapshot.clickHouseRows.length}`);
  console.log(`persistedSessionTraceRows=${snapshot.clickHouseSessionTraceRows.length}`);
  console.log(`persistedSessionRows=${snapshot.postgresSessionRows.length}`);
}

void main().catch((error: unknown) => {
  process.stderr.write(`${String(error)}\n`);
  process.exit(1);
});
