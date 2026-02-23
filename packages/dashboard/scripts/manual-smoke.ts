import { summarizeCost, startDashboardServer } from "../src";
import { buildTimelinePromptGroups, summarizeProjects, toSessionList } from "../src/mappers";
import { createDashboardSampleTrace } from "../src/samples";

async function main(): Promise<void> {
  const traceOne = createDashboardSampleTrace({
    sessionId: "sess_manual_1",
    user: { id: "user_a" },
    environment: {
      terminal: "bash",
      projectPath: "/project/a",
      gitRepo: "repo-a",
      gitBranch: "main"
    },
    metrics: {
      ...createDashboardSampleTrace().metrics,
      totalCostUsd: 1.2
    }
  });

  const traceTwo = createDashboardSampleTrace({
    sessionId: "sess_manual_2",
    user: { id: "user_b" },
    environment: {
      terminal: "bash",
      projectPath: "/project/b",
      gitRepo: "repo-b",
      gitBranch: "dev"
    },
    metrics: {
      ...createDashboardSampleTrace().metrics,
      totalCostUsd: 0.8
    }
  });

  const list = toSessionList([traceOne, traceTwo]);
  const timelineGroups = buildTimelinePromptGroups(traceOne);
  const costSummary = summarizeCost([traceOne, traceTwo]);
  const projectSummary = summarizeProjects([traceOne, traceTwo]);

  if (list.length !== 2) {
    throw new Error("dashboard smoke failed: expected 2 session rows");
  }
  if (timelineGroups.length === 0) {
    throw new Error("dashboard smoke failed: timeline groups should not be empty");
  }
  if (costSummary.totalCostUsd !== 2) {
    throw new Error(`dashboard smoke failed: expected total cost 2, got ${String(costSummary.totalCostUsd)}`);
  }
  if (projectSummary.length !== 2) {
    throw new Error("dashboard smoke failed: expected 2 project summaries");
  }

  const dashboard = await startDashboardServer({
    host: "127.0.0.1",
    port: 0,
    sessionsProvider: {
      fetchSessions: async () => [
        {
          sessionId: "sess_dashboard_smoke",
          userId: "user_dashboard_smoke",
          gitRepo: "repo-smoke",
          gitBranch: "main",
          startedAt: "2026-02-23T10:00:00.000Z",
          endedAt: null,
          promptCount: 1,
          toolCallCount: 2,
          totalCostUsd: 0.42
        }
      ]
    }
  });
  try {
    const health = await fetch(`http://${dashboard.address}/health`);
    if (health.status !== 200) {
      throw new Error("dashboard smoke failed: standalone server health check failed");
    }

    const stream = await fetch(`http://${dashboard.address}/api/sessions/stream`);
    if (stream.status !== 200) {
      throw new Error("dashboard smoke failed: sessions stream endpoint failed");
    }
    const reader = stream.body?.getReader();
    if (reader === undefined) {
      throw new Error("dashboard smoke failed: stream body missing");
    }
    const firstChunk = await reader.read();
    const firstText = new TextDecoder().decode(firstChunk.value ?? new Uint8Array());
    if (!firstText.includes("event: sessions")) {
      throw new Error("dashboard smoke failed: sessions stream event missing");
    }
    await reader.cancel();
  } finally {
    await dashboard.close();
  }

  console.log("dashboard manual smoke passed");
  console.log(`sessionRows=${list.length}`);
  console.log(`projectSummaries=${projectSummary.length}`);
  console.log(`totalCostUsd=${costSummary.totalCostUsd}`);
  console.log("standaloneServerHealth=ok");
}

void main().catch((error: unknown) => {
  process.stderr.write(`${String(error)}\n`);
  process.exit(1);
});
