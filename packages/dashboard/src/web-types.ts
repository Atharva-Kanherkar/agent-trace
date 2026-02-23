export interface DashboardHealthResponse {
  readonly status: "ok";
  readonly service: "dashboard";
  readonly uptimeSec: number;
}

export interface DashboardSessionSummary {
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

export interface DashboardServerSessionsResponse {
  readonly status: "ok";
  readonly count: number;
  readonly sessions: readonly DashboardSessionSummary[];
}

export interface DashboardSessionsProvider {
  fetchSessions(): Promise<readonly DashboardSessionSummary[]>;
}

export interface DashboardReplayTimelineEvent {
  readonly id: string;
  readonly type: string;
  readonly timestamp: string;
  readonly promptId?: string;
  readonly status?: string;
  readonly costUsd?: number;
  readonly details?: Readonly<Record<string, unknown>>;
}

export interface DashboardSessionReplay {
  readonly sessionId: string;
  readonly startedAt: string;
  readonly endedAt?: string;
  readonly metrics: {
    readonly promptCount: number;
    readonly toolCallCount: number;
    readonly totalCostUsd: number;
  };
  readonly timeline: readonly DashboardReplayTimelineEvent[];
}

export interface DashboardSessionReplayResponse {
  readonly status: "ok";
  readonly session: DashboardSessionReplay;
}

export interface DashboardSessionReplayProvider {
  fetchSession(sessionId: string): Promise<DashboardSessionReplay | undefined>;
}

export interface DashboardRenderOptions {
  readonly title?: string;
}

export interface DashboardServerStartOptions {
  readonly host?: string;
  readonly port?: number;
  readonly apiBaseUrl?: string;
  readonly startedAtMs?: number;
  readonly sessionsProvider?: DashboardSessionsProvider;
  readonly sessionReplayProvider?: DashboardSessionReplayProvider;
}

export interface DashboardServerHandle {
  readonly address: string;
  readonly apiBaseUrl: string;
  close(): Promise<void>;
}
