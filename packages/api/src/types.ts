import type { AgentSessionTrace, TimelineEvent } from "../../schema/src/types";
import type { InsightsConfig, SessionInsight, TeamInsight, TeamInsightsContext } from "../../schema/src/insights-types";

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
  readonly userDisplayName: string | null;
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

export interface ApiTeamInsightsGenerateResponse {
  readonly status: "ok";
  readonly insight: TeamInsight;
}

export interface ApiTeamInsightsContextResponse {
  readonly status: "ok";
  readonly configured: boolean;
  readonly context?: TeamInsightsContext;
}

export interface ApiTeamInsightsContextSaveResponse {
  readonly status: "ok";
}

export interface ApiTeamOverviewResponse {
  readonly status: "ok";
  readonly period: { readonly from: string; readonly to: string };
  readonly totalCostUsd: number;
  readonly totalSessions: number;
  readonly totalCommits: number;
  readonly totalPullRequests: number;
  readonly totalLinesAdded: number;
  readonly totalLinesRemoved: number;
  readonly memberCount: number;
  readonly costPerCommit: number;
  readonly costPerPullRequest: number;
}

export interface ApiTeamMember {
  readonly userId: string;
  readonly displayName: string | null;
  readonly sessionCount: number;
  readonly totalCostUsd: number;
  readonly commitCount: number;
  readonly prCount: number;
  readonly linesAdded: number;
  readonly linesRemoved: number;
  readonly costPerCommit: number;
  readonly lastActiveAt: string;
}

export interface ApiTeamMembersResponse {
  readonly status: "ok";
  readonly members: readonly ApiTeamMember[];
}

export interface ApiTeamCostDailyMemberBreakdown {
  readonly userId: string;
  readonly totalCostUsd: number;
  readonly sessionCount: number;
}

export interface ApiTeamCostDailyPoint {
  readonly date: string;
  readonly totalCostUsd: number;
  readonly sessionCount: number;
  readonly byMember: readonly ApiTeamCostDailyMemberBreakdown[];
}

export interface ApiTeamCostDailyResponse {
  readonly status: "ok";
  readonly points: readonly ApiTeamCostDailyPoint[];
}

export interface ApiTeamBudget {
  readonly monthlyLimitUsd: number;
  readonly alertThresholdPercent: number;
}

export interface ApiTeamBudgetResponse {
  readonly status: "ok";
  readonly budget: ApiTeamBudget | null;
  readonly currentMonthSpend: number;
  readonly percentUsed: number;
}

export interface ApiTeamBudgetSaveResponse {
  readonly status: "ok";
  readonly budget: ApiTeamBudget;
}

export interface ApiTeamAnalyticsModelUsage {
  readonly model: string;
  readonly sessionCount: number;
  readonly totalCostUsd: number;
}

export interface ApiTeamAnalyticsToolUsage {
  readonly tool: string;
  readonly callCount: number;
}

export interface ApiTeamAnalyticsRepoUsage {
  readonly repo: string;
  readonly sessionCount: number;
  readonly commitCount: number;
}

export interface ApiTeamAnalyticsMember {
  readonly userId: string;
  readonly displayName: string | null;
  readonly totalCostUsd: number;
  readonly sessionCount: number;
  readonly commitCount: number;
  readonly prCount: number;
  readonly linesAdded: number;
  readonly linesRemoved: number;
  readonly avgSessionCostUsd: number;
  readonly costPerCommit: number;
  readonly totalInputTokens: number;
  readonly totalOutputTokens: number;
  readonly models: readonly ApiTeamAnalyticsModelUsage[];
  readonly tools: readonly ApiTeamAnalyticsToolUsage[];
  readonly repos: readonly ApiTeamAnalyticsRepoUsage[];
  readonly hourlyActivity: readonly number[];
  readonly dailyActivity: readonly number[];
}

export interface ApiTeamAnalyticsHeatmapCell {
  readonly hour: number;
  readonly day: number;
  readonly count: number;
}

export interface ApiTeamAnalyticsCostTrendPoint {
  readonly date: string;
  readonly costUsd: number;
  readonly sessionCount: number;
  readonly cumulativeCostUsd: number;
}

export interface ApiTeamAnalyticsResponse {
  readonly status: "ok";
  readonly period: { readonly from: string; readonly to: string };
  readonly memberAnalytics: readonly ApiTeamAnalyticsMember[];
  readonly topModels: readonly ApiTeamAnalyticsModelUsage[];
  readonly topTools: readonly ApiTeamAnalyticsToolUsage[];
  readonly hourlyHeatmap: readonly ApiTeamAnalyticsHeatmapCell[];
  readonly costTrend: readonly ApiTeamAnalyticsCostTrendPoint[];
  readonly avgCostPerSession: number;
  readonly avgCommitsPerSession: number;
  readonly avgCostPerCommit: number;
  readonly totalTokensUsed: number;
  readonly costEfficiencyScore: number;
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
  | ApiTeamOverviewResponse
  | ApiTeamMembersResponse
  | ApiTeamCostDailyResponse
  | ApiTeamBudgetResponse
  | ApiTeamBudgetSaveResponse
  | ApiTeamAnalyticsResponse
  | ApiTeamInsightsGenerateResponse
  | ApiTeamInsightsContextResponse
  | ApiTeamInsightsContextSaveResponse
  | ApiErrorResponse;

export interface ApiResponse {
  readonly statusCode: number;
  readonly payload: ApiPayload;
}

export interface SessionFilters {
  readonly userId?: string;
  readonly repo?: string;
  readonly from?: string;
  readonly to?: string;
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
  getTeamInsightsContext(): TeamInsightsContext | undefined;
  setTeamInsightsContext(context: TeamInsightsContext): void;
}

export interface ApiTeamBudgetStore {
  getTeamBudget(): ApiTeamBudget | undefined;
  upsertTeamBudget(limitUsd: number, alertPercent: number): void;
  getMonthSpend(yearMonth: string): number;
}

export interface ApiHandlerDependencies {
  readonly startedAtMs: number;
  readonly repository: ApiSessionRepository;
  readonly dailyCostReader?: ApiDailyCostReader;
  readonly insightsConfigAccessor?: ApiInsightsConfigAccessor;
  readonly teamBudgetStore?: ApiTeamBudgetStore;
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
