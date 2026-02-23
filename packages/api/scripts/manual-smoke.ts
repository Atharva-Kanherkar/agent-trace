import { handleApiRequest, InMemorySessionRepository } from "../src";
import { createSampleTrace } from "../src/samples";
import type { ApiHandlerDependencies } from "../src/types";

function createDependencies(): ApiHandlerDependencies {
  const repository = new InMemorySessionRepository([
    createSampleTrace({
      sessionId: "sess_manual_001",
      user: { id: "user_manual_001" },
      environment: {
        terminal: "bash",
        projectPath: "/home/atharva/agent-trace",
        gitRepo: "repo-manual",
        gitBranch: "main"
      }
    })
  ]);

  return {
    startedAtMs: Date.now() - 1000,
    repository
  };
}

function main(): void {
  const dependencies = createDependencies();

  const health = handleApiRequest(
    {
      method: "GET",
      url: "/health"
    },
    dependencies
  );

  const list = handleApiRequest(
    {
      method: "GET",
      url: "/v1/sessions?userId=user_manual_001&repo=repo-manual"
    },
    dependencies
  );

  const detail = handleApiRequest(
    {
      method: "GET",
      url: "/v1/sessions/sess_manual_001"
    },
    dependencies
  );

  const timeline = handleApiRequest(
    {
      method: "GET",
      url: "/v1/sessions/sess_manual_001/timeline"
    },
    dependencies
  );

  if (health.statusCode !== 200 || health.payload.status !== "ok") {
    throw new Error("api smoke failed: health check failed");
  }

  if (list.statusCode !== 200 || list.payload.status !== "ok" || !("sessions" in list.payload)) {
    throw new Error("api smoke failed: list endpoint failed");
  }

  if (list.payload.count !== 1) {
    throw new Error(`api smoke failed: expected 1 session, got ${String(list.payload.count)}`);
  }

  if (detail.statusCode !== 200 || detail.payload.status !== "ok" || !("session" in detail.payload)) {
    throw new Error("api smoke failed: detail endpoint failed");
  }

  if (timeline.statusCode !== 200 || timeline.payload.status !== "ok" || !("timeline" in timeline.payload)) {
    throw new Error("api smoke failed: timeline endpoint failed");
  }

  console.log("api manual smoke passed");
  console.log(`sessionId=${detail.payload.session.sessionId}`);
  console.log(`timelineEvents=${timeline.payload.timeline.length}`);
}

main();

