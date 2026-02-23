import assert from "node:assert/strict";
import test from "node:test";

import { buildTimelinePromptGroups, summarizeProjects, toSessionList, toSessionListItem } from "../src";
import { createDashboardSampleTrace } from "../src/samples";

test("toSessionListItem maps core session fields", () => {
  const trace = createDashboardSampleTrace();
  const item = toSessionListItem(trace);

  assert.equal(item.sessionId, trace.sessionId);
  assert.equal(item.userId, trace.user.id);
  assert.equal(item.totalCostUsd, trace.metrics.totalCostUsd);
  assert.equal(item.durationMs, trace.activeDurationMs);
});

test("toSessionList sorts by startedAt descending", () => {
  const older = createDashboardSampleTrace({
    sessionId: "sess_old",
    startedAt: "2026-02-23T09:00:00.000Z"
  });
  const newer = createDashboardSampleTrace({
    sessionId: "sess_new",
    startedAt: "2026-02-23T11:00:00.000Z"
  });

  const list = toSessionList([older, newer]);
  assert.equal(list[0]?.sessionId, "sess_new");
  assert.equal(list[1]?.sessionId, "sess_old");
});

test("buildTimelinePromptGroups groups by promptId and aggregates cost", () => {
  const trace = createDashboardSampleTrace({
    timeline: [
      {
        id: "e1",
        type: "user_prompt",
        timestamp: "2026-02-23T10:00:01.000Z",
        promptId: "p1",
        costUsd: 0.1
      },
      {
        id: "e2",
        type: "tool_result",
        timestamp: "2026-02-23T10:00:02.000Z",
        promptId: "p1",
        costUsd: 0.2
      },
      {
        id: "e3",
        type: "tool_result",
        timestamp: "2026-02-23T10:00:03.000Z",
        costUsd: 0.05
      }
    ]
  });

  const groups = buildTimelinePromptGroups(trace);
  const p1 = groups.find((group) => group.promptId === "p1");
  const ungrouped = groups.find((group) => group.promptId === "__ungrouped__");

  assert.ok(p1 !== undefined);
  assert.ok(ungrouped !== undefined);
  assert.equal(p1?.events.length, 2);
  assert.equal(p1?.totalCostUsd, 0.3);
  assert.equal(ungrouped?.events.length, 1);
});

test("summarizeProjects returns aggregated costs per project", () => {
  const projectA1 = createDashboardSampleTrace({
    sessionId: "a1",
    environment: {
      terminal: "bash",
      projectPath: "/project/a",
      gitRepo: "repo-a",
      gitBranch: "main"
    },
    metrics: {
      ...createDashboardSampleTrace().metrics,
      totalCostUsd: 1.25
    }
  });
  const projectA2 = createDashboardSampleTrace({
    sessionId: "a2",
    environment: {
      terminal: "bash",
      projectPath: "/project/a",
      gitRepo: "repo-a",
      gitBranch: "main"
    },
    metrics: {
      ...createDashboardSampleTrace().metrics,
      totalCostUsd: 0.75
    }
  });
  const projectB = createDashboardSampleTrace({
    sessionId: "b1",
    environment: {
      terminal: "bash",
      projectPath: "/project/b",
      gitRepo: "repo-b",
      gitBranch: "main"
    },
    metrics: {
      ...createDashboardSampleTrace().metrics,
      totalCostUsd: 0.5
    }
  });

  const summary = summarizeProjects([projectA1, projectA2, projectB]);
  assert.equal(summary.length, 2);
  assert.equal(summary[0]?.project, "/project/a");
  assert.equal(summary[0]?.sessions, 2);
  assert.equal(summary[0]?.totalCostUsd, 2);
});

