import { summarizeCost } from "../src";
import { buildTimelinePromptGroups, summarizeProjects, toSessionList } from "../src/mappers";
import { createDashboardSampleTrace } from "../src/samples";

function main(): void {
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

  console.log("dashboard manual smoke passed");
  console.log(`sessionRows=${list.length}`);
  console.log(`projectSummaries=${projectSummary.length}`);
  console.log(`totalCostUsd=${costSummary.totalCostUsd}`);
}

main();

