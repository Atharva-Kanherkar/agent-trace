import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";

import { createApiHttpHandler } from "../src/http";
import { InMemorySessionRepository } from "../src/repository";
import { createSampleTrace } from "../src/samples";
import type { ApiHandlerDependencies } from "../src/types";

async function listen(server: http.Server): Promise<string> {
  await new Promise<void>((resolve, reject) => {
    server.listen(0, "127.0.0.1", () => resolve());
    server.once("error", (error) => reject(error));
  });

  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("failed to resolve server address");
  }
  return `http://127.0.0.1:${String(address.port)}`;
}

async function close(server: http.Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error !== undefined && error !== null) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

function createDependencies(): ApiHandlerDependencies {
  const repository = new InMemorySessionRepository([
    createSampleTrace({
      sessionId: "sess_api_sse_001",
      user: { id: "user_api_sse_001" }
    })
  ]);

  return {
    startedAtMs: Date.now() - 1000,
    repository
  };
}

test("createApiHttpHandler serves SSE stream of sessions", async () => {
  const server = http.createServer(createApiHttpHandler(createDependencies()));
  const baseUrl = await listen(server);

  try {
    const response = await fetch(`${baseUrl}/v1/sessions/stream`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type")?.includes("text/event-stream"), true);

    const reader = response.body?.getReader();
    assert.notEqual(reader, undefined);
    if (reader === undefined) {
      assert.fail("expected readable stream body");
    }

    const first = await reader.read();
    assert.equal(first.done, false);
    const text = new TextDecoder().decode(first.value ?? new Uint8Array());
    assert.equal(text.includes("event: sessions"), true);
    assert.equal(text.includes("sess_api_sse_001"), true);

    await reader.cancel();
  } finally {
    await close(server);
  }
});
