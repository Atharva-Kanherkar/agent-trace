import assert from "node:assert/strict";
import test from "node:test";

import { startStandaloneCollector } from "../src";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function createEnvelope(eventId: string): Readonly<Record<string, unknown>> {
  return {
    schemaVersion: "1.0",
    source: "hook",
    sourceVersion: "agent-trace-cli-v0.1",
    eventId,
    sessionId: "sess_standalone_collector_test",
    eventType: "tool_result",
    eventTimestamp: "2026-02-23T10:10:00.000Z",
    ingestedAt: "2026-02-23T10:10:01.000Z",
    privacyTier: 1,
    payload: {}
  };
}

test("standalone collector starts HTTP + OTEL endpoints and handles ingest", async () => {
  const collector = await startStandaloneCollector({
    host: "127.0.0.1",
    httpPort: 0,
    otelGrpcAddress: "127.0.0.1:0",
    enableTranscriptIngestion: false
  });

  try {
    assert.equal(collector.httpAddress.includes(":"), true);
    assert.equal(collector.otelGrpcAddress.includes(":"), true);

    const healthResponse = await fetch(`http://${collector.httpAddress}/health`);
    assert.equal(healthResponse.status, 200);

    const ingestResponse = await fetch(`http://${collector.httpAddress}/v1/hooks`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(createEnvelope("evt_standalone_collector_test_001"))
    });
    assert.equal(ingestResponse.status, 202);

    const statsResponse = await fetch(`http://${collector.httpAddress}/v1/hooks/stats`);
    assert.equal(statsResponse.status, 200);
    const statsPayload = (await statsResponse.json()) as unknown;
    assert.equal(isRecord(statsPayload), true);

    if (!isRecord(statsPayload)) {
      assert.fail("expected stats payload object");
    }
    const stats = statsPayload["stats"];
    assert.equal(isRecord(stats), true);
    if (!isRecord(stats)) {
      assert.fail("expected stats object");
    }
    assert.equal(stats["storedEvents"], 1);
    assert.equal(stats["dedupedEvents"], 0);
  } finally {
    await collector.close();
  }
});
