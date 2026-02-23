import assert from "node:assert/strict";
import test from "node:test";

import { handleApiRequest, InMemorySessionRepository } from "../src";
import { createSampleTrace } from "../src/samples";
import type { ApiHandlerDependencies } from "../src/types";

function createDependencies(): ApiHandlerDependencies {
  const repository = new InMemorySessionRepository([
    createSampleTrace({
      sessionId: "sess_001",
      user: { id: "user_001" },
      environment: {
        terminal: "bash",
        projectPath: "/home/atharva/agent-trace",
        gitRepo: "repo-a",
        gitBranch: "main"
      }
    }),
    createSampleTrace({
      sessionId: "sess_002",
      user: { id: "user_002" },
      environment: {
        terminal: "bash",
        projectPath: "/home/atharva/agent-trace",
        gitRepo: "repo-b",
        gitBranch: "main"
      }
    })
  ]);

  return {
    startedAtMs: Date.now() - 4000,
    repository
  };
}

test("GET /health returns api status payload", () => {
  const response = handleApiRequest(
    {
      method: "GET",
      url: "/health"
    },
    createDependencies()
  );

  assert.equal(response.statusCode, 200);
  assert.equal(response.payload.status, "ok");
  if (response.payload.status === "ok" && "service" in response.payload) {
    assert.equal(response.payload.service, "api");
    assert.ok(response.payload.uptimeSec >= 3);
  } else {
    assert.fail("expected health payload");
  }
});

test("GET /v1/sessions returns summary list with filters", () => {
  const all = handleApiRequest(
    {
      method: "GET",
      url: "/v1/sessions"
    },
    createDependencies()
  );
  assert.equal(all.statusCode, 200);
  assert.equal(all.payload.status, "ok");
  if (all.payload.status === "ok" && "sessions" in all.payload) {
    assert.equal(all.payload.count, 2);
  } else {
    assert.fail("expected session list payload");
  }

  const filtered = handleApiRequest(
    {
      method: "GET",
      url: "/v1/sessions?userId=user_001&repo=repo-a"
    },
    createDependencies()
  );
  assert.equal(filtered.statusCode, 200);
  assert.equal(filtered.payload.status, "ok");
  if (filtered.payload.status === "ok" && "sessions" in filtered.payload) {
    assert.equal(filtered.payload.count, 1);
    assert.equal(filtered.payload.sessions[0]?.sessionId, "sess_001");
  } else {
    assert.fail("expected filtered session list payload");
  }
});

test("GET /v1/sessions/:id and /timeline returns trace data", () => {
  const detail = handleApiRequest(
    {
      method: "GET",
      url: "/v1/sessions/sess_001"
    },
    createDependencies()
  );

  assert.equal(detail.statusCode, 200);
  assert.equal(detail.payload.status, "ok");
  if (detail.payload.status === "ok" && "session" in detail.payload) {
    assert.equal(detail.payload.session.sessionId, "sess_001");
  } else {
    assert.fail("expected session detail payload");
  }

  const timeline = handleApiRequest(
    {
      method: "GET",
      url: "/v1/sessions/sess_001/timeline"
    },
    createDependencies()
  );
  assert.equal(timeline.statusCode, 200);
  assert.equal(timeline.payload.status, "ok");
  if (timeline.payload.status === "ok" && "timeline" in timeline.payload) {
    assert.equal(Array.isArray(timeline.payload.timeline), true);
    assert.equal(timeline.payload.timeline.length, 1);
  } else {
    assert.fail("expected timeline payload");
  }
});

test("returns 404 for unknown routes and missing session", () => {
  const missing = handleApiRequest(
    {
      method: "GET",
      url: "/v1/sessions/not-found"
    },
    createDependencies()
  );
  assert.equal(missing.statusCode, 404);
  assert.equal(missing.payload.status, "error");
  if (missing.payload.status === "error") {
    assert.equal(missing.payload.message, "session not found");
  } else {
    assert.fail("expected error payload");
  }

  const unknown = handleApiRequest(
    {
      method: "GET",
      url: "/v1/unknown"
    },
    createDependencies()
  );
  assert.equal(unknown.statusCode, 404);
  assert.equal(unknown.payload.status, "error");
  if (unknown.payload.status === "error") {
    assert.equal(unknown.payload.message, "not found");
  } else {
    assert.fail("expected error payload");
  }
});

