import type { AgentSessionTrace } from "../../schema/src/types";
import type { DashboardProjectSummary, SessionListItem, TimelinePromptGroup } from "./types";

function normalizeGitRepo(trace: AgentSessionTrace): string {
  return trace.environment.gitRepo ?? "unknown-repo";
}

function normalizeGitBranch(trace: AgentSessionTrace): string {
  return trace.environment.gitBranch ?? "unknown-branch";
}

export function toSessionListItem(trace: AgentSessionTrace): SessionListItem {
  const endedAt = trace.endedAt ?? null;
  const durationMs = trace.activeDurationMs;

  return {
    sessionId: trace.sessionId,
    userId: trace.user.id,
    gitRepo: normalizeGitRepo(trace),
    gitBranch: normalizeGitBranch(trace),
    startedAt: trace.startedAt,
    endedAt,
    durationMs,
    promptCount: trace.metrics.promptCount,
    toolCallCount: trace.metrics.toolCallCount,
    totalCostUsd: trace.metrics.totalCostUsd
  };
}

export function toSessionList(traces: readonly AgentSessionTrace[]): readonly SessionListItem[] {
  return traces
    .map(toSessionListItem)
    .sort((a, b) => (a.startedAt < b.startedAt ? 1 : a.startedAt > b.startedAt ? -1 : 0));
}

export function buildTimelinePromptGroups(trace: AgentSessionTrace): readonly TimelinePromptGroup[] {
  const groups = new Map<string, { events: AgentSessionTrace["timeline"]; cost: number }>();

  trace.timeline.forEach((event) => {
    const promptId = event.promptId ?? "__ungrouped__";
    const existing = groups.get(promptId);

    if (existing === undefined) {
      groups.set(promptId, {
        events: [event],
        cost: Number((event.costUsd ?? 0).toFixed(6))
      });
      return;
    }

    const nextCost = Number((existing.cost + (event.costUsd ?? 0)).toFixed(6));
    groups.set(promptId, {
      events: [...existing.events, event],
      cost: nextCost
    });
  });

  return [...groups.entries()].map(([promptId, value]) => ({
    promptId,
    events: value.events,
    totalCostUsd: value.cost
  }));
}

export function summarizeProjects(traces: readonly AgentSessionTrace[]): readonly DashboardProjectSummary[] {
  const byProject = new Map<string, { sessions: number; cost: number }>();

  traces.forEach((trace) => {
    const project = trace.environment.projectPath ?? "unknown-project";
    const existing = byProject.get(project);
    if (existing === undefined) {
      byProject.set(project, {
        sessions: 1,
        cost: trace.metrics.totalCostUsd
      });
      return;
    }
    byProject.set(project, {
      sessions: existing.sessions + 1,
      cost: existing.cost + trace.metrics.totalCostUsd
    });
  });

  return [...byProject.entries()]
    .map(([project, value]) => ({
      project,
      sessions: value.sessions,
      totalCostUsd: Number(value.cost.toFixed(6))
    }))
    .sort((a, b) => b.totalCostUsd - a.totalCostUsd);
}
