import assert from "node:assert/strict";
import test from "node:test";

import { startDashboardServer } from "../src/web-server";

test("startDashboardServer serves html, health, and sessions bridge", async () => {
  const dashboard = await startDashboardServer({
    host: "127.0.0.1",
    port: 0,
    sessionsProvider: {
      fetchSessions: async () => [
        {
          sessionId: "sess_dashboard_001",
          userId: "user_dashboard_001",
          gitRepo: "Atharva-Kanherkar/agent-trace",
          gitBranch: "main",
          startedAt: "2026-02-23T10:00:00.000Z",
          endedAt: "2026-02-23T10:10:00.000Z",
          promptCount: 4,
          toolCallCount: 8,
          totalCostUsd: 0.31
        }
      ]
    }
  });

  try {
    const htmlResponse = await fetch(`http://${dashboard.address}/`);
    assert.equal(htmlResponse.status, 200);
    const html = await htmlResponse.text();
    assert.equal(html.includes("agent-trace dashboard"), true);

    const healthResponse = await fetch(`http://${dashboard.address}/health`);
    assert.equal(healthResponse.status, 200);

    const sessionsResponse = await fetch(`http://${dashboard.address}/api/sessions`);
    assert.equal(sessionsResponse.status, 200);
    const sessionsPayload = (await sessionsResponse.json()) as {
      readonly status: string;
      readonly count: number;
    };
    assert.equal(sessionsPayload.status, "ok");
    assert.equal(sessionsPayload.count, 1);
  } finally {
    await dashboard.close();
  }
});
