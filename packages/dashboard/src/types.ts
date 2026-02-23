import type { AgentSessionTrace, TimelineEvent } from "../../schema/src/types";

export interface SessionListItem {
  readonly sessionId: string;
  readonly userId: string;
  readonly gitRepo: string;
  readonly gitBranch: string;
  readonly startedAt: string;
  readonly endedAt: string | null;
  readonly durationMs: number;
  readonly promptCount: number;
  readonly toolCallCount: number;
  readonly totalCostUsd: number;
}

export interface TimelinePromptGroup {
  readonly promptId: string;
  readonly events: readonly TimelineEvent[];
  readonly totalCostUsd: number;
}

export interface CostSummary {
  readonly totalCostUsd: number;
  readonly averageCostUsd: number;
  readonly highestCostSessionId: string | null;
}

export interface DashboardProjectSummary {
  readonly project: string;
  readonly sessions: number;
  readonly totalCostUsd: number;
}

export interface DashboardRepository {
  readonly traces: readonly AgentSessionTrace[];
}

