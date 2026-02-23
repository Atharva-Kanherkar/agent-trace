import type { AgentSessionTrace, TimelineEvent } from "../../schema/src/types";

export type ApiMethod = "GET";

export interface ApiRequest {
  readonly method: ApiMethod;
  readonly url: string;
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

export interface ApiErrorResponse {
  readonly status: "error";
  readonly message: string;
}

export type ApiPayload =
  | ApiHealthResponse
  | ApiSessionListResponse
  | ApiSessionDetailResponse
  | ApiSessionTimelineResponse
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

export interface ApiHandlerDependencies {
  readonly startedAtMs: number;
  readonly repository: ApiSessionRepository;
}
