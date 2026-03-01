import assert from "node:assert/strict";
import test from "node:test";

import { handleApiRawHttpRequest, InMemorySessionRepository } from "../src";
import { createSampleTrace } from "../src/samples";
import type { ApiHandlerDependencies } from "../src/types";

function createDependencies(): ApiHandlerDependencies {
  const repository = new InMemorySessionRepository([
    createSampleTrace({
      sessionId: "sess_001",
      user: { id: "user_001" }
    })
  ]);

  return {
    startedAtMs: Date.now() - 3000,
    repository
  };
}

test("raw API adapter accepts GET requests", async () => {
  const response = await handleApiRawHttpRequest(
    {
      method: "GET",
      url: "/v1/sessions"
    },
    createDependencies()
  );

  assert.equal(response.statusCode, 200);
  assert.equal(response.payload.status, "ok");
});

test("raw API adapter rejects unsupported methods", async () => {
  const response = await handleApiRawHttpRequest(
    {
      method: "DELETE",
      url: "/v1/sessions"
    },
    createDependencies()
  );

  assert.equal(response.statusCode, 405);
  assert.equal(response.payload.status, "error");
  if (response.payload.status === "error") {
    assert.equal(response.payload.message, "method not allowed");
  }
});
