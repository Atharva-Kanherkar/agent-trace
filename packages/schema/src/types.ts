export type SchemaVersion = "1.0";
export type EventSource = "otel" | "hook" | "transcript" | "git";
export type PrivacyTier = 1 | 2 | 3;
export type AgentType = "claude_code";

export interface ValidationSuccess<TValue> {
  ok: true;
  value: TValue;
  errors: readonly [];
}

export interface ValidationFailure {
  ok: false;
  value: undefined;
  errors: readonly string[];
}

export type ValidationResult<TValue> = ValidationSuccess<TValue> | ValidationFailure;

export type EventAttributes = Readonly<Record<string, string>>;

export interface EventEnvelope<TPayload = unknown> {
  readonly schemaVersion: SchemaVersion;
  readonly source: EventSource;
  readonly sourceVersion?: string;
  readonly eventId: string;
  readonly sessionId: string;
  readonly promptId?: string;
  readonly eventType: string;
  readonly eventTimestamp: string;
  readonly ingestedAt: string;
  readonly privacyTier: PrivacyTier;
  readonly payload: TPayload;
  readonly attributes?: EventAttributes;
}

export interface TimelineTokenUsage {
  readonly input: number;
  readonly output: number;
  readonly cacheRead?: number;
  readonly cacheWrite?: number;
}

export interface TimelineEvent {
  readonly id: string;
  readonly type: string;
  readonly timestamp: string;
  readonly promptId?: string;
  readonly group?: string;
  readonly status?: string;
  readonly costUsd?: number;
  readonly tokens?: TimelineTokenUsage;
  readonly details?: Readonly<Record<string, unknown>>;
}

export interface SessionMetrics {
  readonly promptCount: number;
  readonly apiCallCount: number;
  readonly toolCallCount: number;
  readonly totalCostUsd: number;
  readonly totalInputTokens: number;
  readonly totalOutputTokens: number;
  readonly totalCacheReadTokens: number;
  readonly totalCacheWriteTokens: number;
  readonly linesAdded: number;
  readonly linesRemoved: number;
  readonly filesTouched: readonly string[];
  readonly modelsUsed: readonly string[];
  readonly toolsUsed: readonly string[];
}

export interface CommitInfo {
  readonly sha: string;
  readonly promptId?: string;
  readonly message?: string;
  readonly linesAdded?: number;
  readonly linesRemoved?: number;
  readonly committedAt?: string;
}

export interface PullRequestInfo {
  readonly repo: string;
  readonly prNumber: number;
  readonly state: string;
  readonly mergedAt?: string;
  readonly url?: string;
}

export interface SessionUser {
  readonly id: string;
  readonly email?: string;
  readonly displayName?: string;
}

export interface SessionEnvironment {
  readonly terminal?: string;
  readonly projectPath?: string;
  readonly gitRepo?: string;
  readonly gitBranch?: string;
}

export interface SessionGit {
  readonly commits: readonly CommitInfo[];
  readonly pullRequests: readonly PullRequestInfo[];
}

export interface AgentSessionTrace {
  readonly sessionId: string;
  readonly agentType: AgentType;
  readonly user: SessionUser;
  readonly environment: SessionEnvironment;
  readonly startedAt: string;
  readonly endedAt?: string;
  readonly activeDurationMs: number;
  readonly timeline: readonly TimelineEvent[];
  readonly metrics: SessionMetrics;
  readonly git: SessionGit;
}

