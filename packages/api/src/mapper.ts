import type { AgentSessionTrace } from "../../schema/src/types";
import type { ApiSessionSummary } from "./types";

export function toSessionSummary(trace: AgentSessionTrace): ApiSessionSummary {
  return {
    sessionId: trace.sessionId,
    userId: trace.user.id,
    gitRepo: trace.environment.gitRepo ?? null,
    gitBranch: trace.environment.gitBranch ?? null,
    startedAt: trace.startedAt,
    endedAt: trace.endedAt ?? null,
    promptCount: trace.metrics.promptCount,
    toolCallCount: trace.metrics.toolCallCount,
    totalCostUsd: trace.metrics.totalCostUsd,
    commitCount: trace.git.commits.length,
    linesAdded: trace.metrics.linesAdded,
    linesRemoved: trace.metrics.linesRemoved
  };
}

