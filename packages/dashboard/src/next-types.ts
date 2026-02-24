export interface UiSessionSummary {
  readonly sessionId: string;
  readonly userId: string;
  readonly gitRepo: string | null;
  readonly gitBranch: string | null;
  readonly startedAt: string;
  readonly endedAt: string | null;
  readonly promptCount: number;
  readonly toolCallCount: number;
  readonly totalCostUsd: number;
}

export interface UiCostDailyPoint {
  readonly date: string;
  readonly totalCostUsd: number;
  readonly sessionCount: number;
  readonly promptCount: number;
  readonly toolCallCount: number;
}

export interface UiSessionReplayEvent {
  readonly id: string;
  readonly type: string;
  readonly timestamp: string;
  readonly promptId?: string;
  readonly status?: string;
  readonly costUsd?: number;
  readonly toolName?: string;
  readonly toolDurationMs?: number;
  readonly inputTokens?: number;
  readonly outputTokens?: number;
  readonly detail?: string;
}

export interface UiSessionCommit {
  readonly sha: string;
  readonly message?: string | undefined;
  readonly promptId?: string | undefined;
  readonly committedAt?: string | undefined;
}

export interface UiSessionReplayMetrics {
  readonly promptCount: number;
  readonly toolCallCount: number;
  readonly totalCostUsd: number;
  readonly totalInputTokens: number;
  readonly totalOutputTokens: number;
  readonly linesAdded: number;
  readonly linesRemoved: number;
  readonly modelsUsed: readonly string[];
  readonly toolsUsed: readonly string[];
  readonly filesTouched: readonly string[];
}

export interface UiSessionReplay {
  readonly sessionId: string;
  readonly startedAt: string;
  readonly endedAt?: string;
  readonly metrics: UiSessionReplayMetrics;
  readonly commits: readonly UiSessionCommit[];
  readonly timeline: readonly UiSessionReplayEvent[];
}

export interface UiHomeData {
  readonly sessions: readonly UiSessionSummary[];
  readonly costPoints: readonly UiCostDailyPoint[];
}

export interface UiHomeLoadResult {
  readonly data: UiHomeData;
  readonly warning?: string;
}
