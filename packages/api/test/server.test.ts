import assert from "node:assert/strict";
import test from "node:test";

import { InMemorySessionRepository } from "../src/repository";
import { createSampleTrace } from "../src/samples";
import { startApiServer } from "../src/server";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

test("startApiServer serves health and session endpoints", async () => {
  const repository = new InMemorySessionRepository([
    createSampleTrace({
      sessionId: "sess_api_server_001",
      user: { id: "user_api_server_001" }
    })
  ]);

  const api = await startApiServer({
    host: "127.0.0.1",
    port: 0,
    startedAtMs: Date.parse("2026-02-23T10:00:00.000Z"),
    repository
  });

  try {
    const healthResponse = await fetch(`http://${api.address}/health`);
    assert.equal(healthResponse.status, 200);

    const listResponse = await fetch(`http://${api.address}/v1/sessions`);
    assert.equal(listResponse.status, 200);
    const listPayload = (await listResponse.json()) as unknown;
    assert.equal(isRecord(listPayload), true);
    if (!isRecord(listPayload)) {
      assert.fail("expected list payload object");
    }
    assert.equal(listPayload["count"], 1);

    const detailResponse = await fetch(`http://${api.address}/v1/sessions/sess_api_server_001`);
    assert.equal(detailResponse.status, 200);
  } finally {
    await api.close();
  }
});
