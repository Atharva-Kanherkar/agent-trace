import type { AgentSessionTrace, TimelineEvent } from "../../schema/src/types";
import type { InsightsConfig, SessionInsight } from "../../schema/src/insights-types";

export type ApiMethod = "GET" | "POST";

export interface ApiRequest {
  readonly method: ApiMethod;
  readonly url: string;
  readonly body?: unknown;
}

export interface ApiRawHttpRequest {
  readonly method: string;
  readonly url: string;
}

export interface ApiSessionSummary {
  readonly sessionId: string;
  readonly userId: string;
  readonly gitRepo: string | null;
  readonly gitBranch: string | null;
  readonly startedAt: string;
  readonly endedAt: string | null;
  readonly promptCount: number;
  readonly toolCallCount: number;
  readonly totalCostUsd: number;
  readonly commitCount: number;
  readonly linesAdded: number;
  readonly linesRemoved: number;
}

export interface ApiHealthResponse {
  readonly status: "ok";
  readonly service: "api";
  readonly uptimeSec: number;
}

export interface ApiSessionListResponse {
  readonly status: "ok";
  readonly count: number;
  readonly sessions: readonly ApiSessionSummary[];
}

export interface ApiSessionDetailResponse {
  readonly status: "ok";
  readonly session: AgentSessionTrace;
}

export interface ApiSessionTimelineResponse {
  readonly status: "ok";
  readonly timeline: readonly TimelineEvent[];
}

export interface ApiDailyCostPoint {
  readonly date: string;
  readonly totalCostUsd: number;
  readonly sessionCount: number;
  readonly promptCount: number;
  readonly toolCallCount: number;
}

export interface ApiCostDailyResponse {
  readonly status: "ok";
  readonly points: readonly ApiDailyCostPoint[];
}

export interface ApiErrorResponse {
  readonly status: "error";
  readonly message: string;
}

export interface ApiInsightsSettingsResponse {
  readonly status: "ok";
  readonly configured: boolean;
  readonly provider?: string;
  readonly model?: string;
}

export interface ApiInsightsSettingsSaveResponse {
  readonly status: "ok";
  readonly message: string;
  readonly provider: string;
  readonly model: string;
}

export interface ApiInsightsGenerateResponse {
  readonly status: "ok";
  readonly insight: SessionInsight;
}

export type ApiPayload =
  | ApiHealthResponse
  | ApiSessionListResponse
  | ApiSessionDetailResponse
  | ApiSessionTimelineResponse
  | ApiCostDailyResponse
  | ApiInsightsSettingsResponse
  | ApiInsightsSettingsSaveResponse
  | ApiInsightsGenerateResponse
  | ApiErrorResponse;

export interface ApiResponse {
  readonly statusCode: number;
  readonly payload: ApiPayload;
}

export interface SessionFilters {
  readonly userId?: string;
  readonly repo?: string;
}

export interface ApiSessionRepository {
  list(filters: SessionFilters): readonly AgentSessionTrace[];
  getBySessionId(sessionId: string): AgentSessionTrace | undefined;
  upsert(trace: AgentSessionTrace): void;
}

export interface ApiDailyCostReader {
  listDailyCosts(limit?: number): Promise<readonly ApiDailyCostPoint[]>;
}

export interface ApiInsightsConfigAccessor {
  getConfig(): InsightsConfig | undefined;
  setConfig(config: InsightsConfig): void;
}

export interface ApiHandlerDependencies {
  readonly startedAtMs: number;
  readonly repository: ApiSessionRepository;
  readonly dailyCostReader?: ApiDailyCostReader;
  readonly insightsConfigAccessor?: ApiInsightsConfigAccessor;
}

export interface ApiServerStartOptions {
  readonly host?: string;
  readonly port?: number;
  readonly startedAtMs?: number;
  readonly repository?: ApiSessionRepository;
}

export interface ApiServerHandle {
  readonly address: string;
  readonly dependencies: ApiHandlerDependencies;
  close(): Promise<void>;
}
