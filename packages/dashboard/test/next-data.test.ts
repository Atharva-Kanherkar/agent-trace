import assert from "node:assert/strict";
import test from "node:test";

import {
  fetchDailyCostPoints,
  fetchSessionReplay,
  fetchSessionSummaries
} from "../src/next-data";

interface MockFetchResponse {
  readonly status: number;
  readonly jsonBody?: unknown;
}

function installMockFetch(responses: readonly MockFetchResponse[]): () => void {
  const originalFetch = globalThis.fetch;
  let index = 0;

  globalThis.fetch = (async () => {
    const response = responses[index] ?? responses.at(-1);
    index += 1;
    if (response === undefined) {
      throw new Error("mock fetch had no configured response");
    }

    return {
      ok: response.status >= 200 && response.status < 300,
      status: response.status,
      json: async () => response.jsonBody
    } as unknown as Response;
  }) as typeof fetch;

  return (): void => {
    globalThis.fetch = originalFetch;
  };
}

test("fetchSessionSummaries parses session list payload", async () => {
  const restore = installMockFetch([
    {
      status: 200,
      jsonBody: {
        status: "ok",
        sessions: [
          {
            sessionId: "sess_next_001",
            userId: "user_next_001",
            gitRepo: "repo-a",
            gitBranch: "main",
            startedAt: "2026-02-24T10:00:00.000Z",
            endedAt: null,
            promptCount: 2,
            toolCallCount: 4,
            totalCostUsd: 0.5
          }
        ]
      }
    }
  ]);

  try {
    const sessions = await fetchSessionSummaries();
    assert.equal(sessions.length, 1);
    assert.equal(sessions[0]?.sessionId, "sess_next_001");
    assert.equal(sessions[0]?.totalCostUsd, 0.5);
  } finally {
    restore();
  }
});

test("fetchDailyCostPoints parses daily cost payload", async () => {
  const restore = installMockFetch([
    {
      status: 200,
      jsonBody: {
        status: "ok",
        points: [
          {
            date: "2026-02-24",
            totalCostUsd: 1.25,
            sessionCount: 2,
            promptCount: 6,
            toolCallCount: 12
          }
        ]
      }
    }
  ]);

  try {
    const points = await fetchDailyCostPoints();
    assert.equal(points.length, 1);
    assert.equal(points[0]?.date, "2026-02-24");
    assert.equal(points[0]?.totalCostUsd, 1.25);
  } finally {
    restore();
  }
});

test("fetchSessionReplay returns undefined when session is missing", async () => {
  const restore = installMockFetch([
    {
      status: 404
    }
  ]);

  try {
    const replay = await fetchSessionReplay("sess_missing");
    assert.equal(replay, undefined);
  } finally {
    restore();
  }
});

test("fetchSessionReplay parses session detail payload", async () => {
  const restore = installMockFetch([
    {
      status: 200,
      jsonBody: {
        status: "ok",
        session: {
          sessionId: "sess_next_replay_001",
          startedAt: "2026-02-24T10:00:00.000Z",
          metrics: {
            promptCount: 3,
            toolCallCount: 5,
            totalCostUsd: 0.77
          },
          timeline: [
            {
              id: "evt_replay_001",
              type: "tool_result",
              timestamp: "2026-02-24T10:01:00.000Z",
              promptId: "prompt_001",
              status: "ok",
              costUsd: 0.12
            }
          ]
        }
      }
    }
  ]);

  try {
    const replay = await fetchSessionReplay("sess_next_replay_001");
    assert.notEqual(replay, undefined);
    assert.equal(replay?.sessionId, "sess_next_replay_001");
    assert.equal(replay?.timeline.length, 1);
    assert.equal(replay?.metrics.totalCostUsd, 0.77);
  } finally {
    restore();
  }
});
