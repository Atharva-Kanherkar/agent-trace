import { AGENT_TYPES, EVENT_SOURCES, PRIVACY_TIERS, SCHEMA_VERSION } from "./constants";
import type {
  AgentSessionTrace,
  AgentType,
  CommitInfo,
  EventAttributes,
  EventEnvelope,
  EventSource,
  PrivacyTier,
  PullRequestInfo,
  SessionEnvironment,
  SessionGit,
  SessionMetrics,
  SessionUser,
  TimelineEvent,
  TimelineTokenUsage,
  ValidationResult
} from "./types";

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isNonNegativeFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function isValidIsoDate(value: unknown): value is string {
  if (!isNonEmptyString(value)) {
    return false;
  }

  if (Number.isNaN(Date.parse(value))) {
    return false;
  }

  return value.endsWith("Z") || /[+-]\d{2}:\d{2}$/.test(value);
}

function isEventSource(value: unknown): value is EventSource {
  return EVENT_SOURCES.some((source) => source === value);
}

function isPrivacyTier(value: unknown): value is PrivacyTier {
  return PRIVACY_TIERS.some((tier) => tier === value);
}

function isAgentType(value: unknown): value is AgentType {
  return AGENT_TYPES.some((agentType) => agentType === value);
}

function addError(errors: string[], path: string, message: string): void {
  errors.push(`${path}: ${message}`);
}

function readRequiredString(
  source: UnknownRecord,
  key: string,
  errors: string[],
  path: string
): string | undefined {
  const value = source[key];
  if (!isNonEmptyString(value)) {
    addError(errors, path, "must be a non-empty string");
    return undefined;
  }
  return value;
}

function readOptionalString(
  source: UnknownRecord,
  key: string,
  errors: string[],
  path: string
): string | undefined {
  const value = source[key];
  if (value === undefined) {
    return undefined;
  }

  if (!isNonEmptyString(value)) {
    addError(errors, path, "must be a non-empty string when provided");
    return undefined;
  }
  return value;
}

function readRequiredIsoDate(
  source: UnknownRecord,
  key: string,
  errors: string[],
  path: string
): string | undefined {
  const value = source[key];
  if (!isValidIsoDate(value)) {
    addError(errors, path, "must be a valid ISO-8601 date");
    return undefined;
  }
  return value;
}

function readOptionalIsoDate(
  source: UnknownRecord,
  key: string,
  errors: string[],
  path: string
): string | undefined {
  const value = source[key];
  if (value === undefined) {
    return undefined;
  }

  if (!isValidIsoDate(value)) {
    addError(errors, path, "must be a valid ISO-8601 date when provided");
    return undefined;
  }
  return value;
}

function readRequiredNonNegativeNumber(
  source: UnknownRecord,
  key: string,
  errors: string[],
  path: string
): number | undefined {
  const value = source[key];
  if (!isNonNegativeFiniteNumber(value)) {
    addError(errors, path, "must be a non-negative number");
    return undefined;
  }
  return value;
}

function readOptionalNonNegativeNumber(
  source: UnknownRecord,
  key: string,
  errors: string[],
  path: string
): number | undefined {
  const value = source[key];
  if (value === undefined) {
    return undefined;
  }

  if (!isNonNegativeFiniteNumber(value)) {
    addError(errors, path, "must be a non-negative number when provided");
    return undefined;
  }
  return value;
}

function readRequiredStringArray(
  source: UnknownRecord,
  key: string,
  errors: string[],
  path: string
): readonly string[] | undefined {
  const value = source[key];
  if (!Array.isArray(value)) {
    addError(errors, path, "must be an array");
    return undefined;
  }

  const result: string[] = [];
  value.forEach((item, index) => {
    if (!isNonEmptyString(item)) {
      addError(errors, `${path}[${index}]`, "must be a non-empty string");
      return;
    }
    result.push(item);
  });

  return result;
}

function parseAttributes(
  source: UnknownRecord,
  errors: string[]
): EventAttributes | undefined {
  const rawAttributes = source["attributes"];
  if (rawAttributes === undefined) {
    return undefined;
  }

  if (!isRecord(rawAttributes)) {
    addError(errors, "attributes", "must be an object");
    return undefined;
  }

  const attributes: Record<string, string> = {};
  for (const [key, value] of Object.entries(rawAttributes)) {
    if (!isNonEmptyString(key)) {
      addError(errors, "attributes", "keys must be non-empty strings");
      continue;
    }
    if (!isNonEmptyString(value)) {
      addError(errors, `attributes.${key}`, "must be a non-empty string");
      continue;
    }
    attributes[key] = value;
  }

  return attributes;
}

function parseTimelineTokens(
  source: UnknownRecord,
  errors: string[],
  path: string
): TimelineTokenUsage | undefined {
  const inputTokens = readRequiredNonNegativeNumber(source, "input", errors, `${path}.input`);
  const outputTokens = readRequiredNonNegativeNumber(source, "output", errors, `${path}.output`);
  if (inputTokens === undefined || outputTokens === undefined) {
    return undefined;
  }

  return {
    input: inputTokens,
    output: outputTokens
  };
}

function parseTimelineEvent(
  value: unknown,
  index: number,
  errors: string[]
): TimelineEvent | undefined {
  const path = `timeline[${index}]`;
  if (!isRecord(value)) {
    addError(errors, path, "must be an object");
    return undefined;
  }

  const id = readRequiredString(value, "id", errors, `${path}.id`);
  const type = readRequiredString(value, "type", errors, `${path}.type`);
  const timestamp = readRequiredIsoDate(value, "timestamp", errors, `${path}.timestamp`);
  const promptId = readOptionalString(value, "promptId", errors, `${path}.promptId`);
  const group = readOptionalString(value, "group", errors, `${path}.group`);
  const status = readOptionalString(value, "status", errors, `${path}.status`);
  const costUsd = readOptionalNonNegativeNumber(value, "costUsd", errors, `${path}.costUsd`);

  const rawTokens = value["tokens"];
  let tokens: TimelineTokenUsage | undefined;
  if (rawTokens !== undefined) {
    if (!isRecord(rawTokens)) {
      addError(errors, `${path}.tokens`, "must be an object");
    } else {
      tokens = parseTimelineTokens(rawTokens, errors, `${path}.tokens`);
    }
  }

  const rawDetails = value["details"];
  let details: Readonly<Record<string, unknown>> | undefined;
  if (rawDetails !== undefined) {
    if (!isRecord(rawDetails)) {
      addError(errors, `${path}.details`, "must be an object when provided");
    } else {
      details = rawDetails;
    }
  }

  if (id === undefined || type === undefined || timestamp === undefined) {
    return undefined;
  }

  return {
    id,
    type,
    timestamp,
    ...(promptId !== undefined ? { promptId } : {}),
    ...(group !== undefined ? { group } : {}),
    ...(status !== undefined ? { status } : {}),
    ...(costUsd !== undefined ? { costUsd } : {}),
    ...(tokens !== undefined ? { tokens } : {}),
    ...(details !== undefined ? { details } : {})
  };
}

function parseSessionUser(value: unknown, errors: string[]): SessionUser | undefined {
  if (!isRecord(value)) {
    addError(errors, "user", "must be an object");
    return undefined;
  }

  const id = readRequiredString(value, "id", errors, "user.id");
  const email = readOptionalString(value, "email", errors, "user.email");
  if (id === undefined) {
    return undefined;
  }

  return {
    id,
    ...(email !== undefined ? { email } : {})
  };
}

function parseSessionEnvironment(value: unknown, errors: string[]): SessionEnvironment | undefined {
  if (!isRecord(value)) {
    addError(errors, "environment", "must be an object");
    return undefined;
  }

  const terminal = readOptionalString(value, "terminal", errors, "environment.terminal");
  const projectPath = readOptionalString(value, "projectPath", errors, "environment.projectPath");
  const gitRepo = readOptionalString(value, "gitRepo", errors, "environment.gitRepo");
  const gitBranch = readOptionalString(value, "gitBranch", errors, "environment.gitBranch");

  return {
    ...(terminal !== undefined ? { terminal } : {}),
    ...(projectPath !== undefined ? { projectPath } : {}),
    ...(gitRepo !== undefined ? { gitRepo } : {}),
    ...(gitBranch !== undefined ? { gitBranch } : {})
  };
}

function parseSessionMetrics(value: unknown, errors: string[]): SessionMetrics | undefined {
  if (!isRecord(value)) {
    addError(errors, "metrics", "must be an object");
    return undefined;
  }

  const promptCount = readRequiredNonNegativeNumber(value, "promptCount", errors, "metrics.promptCount");
  const apiCallCount = readRequiredNonNegativeNumber(value, "apiCallCount", errors, "metrics.apiCallCount");
  const toolCallCount = readRequiredNonNegativeNumber(value, "toolCallCount", errors, "metrics.toolCallCount");
  const totalCostUsd = readRequiredNonNegativeNumber(value, "totalCostUsd", errors, "metrics.totalCostUsd");
  const totalInputTokens = readRequiredNonNegativeNumber(
    value,
    "totalInputTokens",
    errors,
    "metrics.totalInputTokens"
  );
  const totalOutputTokens = readRequiredNonNegativeNumber(
    value,
    "totalOutputTokens",
    errors,
    "metrics.totalOutputTokens"
  );
  const totalCacheReadTokens = readRequiredNonNegativeNumber(
    value,
    "totalCacheReadTokens",
    errors,
    "metrics.totalCacheReadTokens"
  );
  const totalCacheWriteTokens = readRequiredNonNegativeNumber(
    value,
    "totalCacheWriteTokens",
    errors,
    "metrics.totalCacheWriteTokens"
  );
  const linesAdded = readRequiredNonNegativeNumber(value, "linesAdded", errors, "metrics.linesAdded");
  const linesRemoved = readRequiredNonNegativeNumber(value, "linesRemoved", errors, "metrics.linesRemoved");
  const filesTouched = readRequiredStringArray(value, "filesTouched", errors, "metrics.filesTouched");
  const modelsUsed = readRequiredStringArray(value, "modelsUsed", errors, "metrics.modelsUsed");
  const toolsUsed = readRequiredStringArray(value, "toolsUsed", errors, "metrics.toolsUsed");

  if (
    promptCount === undefined ||
    apiCallCount === undefined ||
    toolCallCount === undefined ||
    totalCostUsd === undefined ||
    totalInputTokens === undefined ||
    totalOutputTokens === undefined ||
    totalCacheReadTokens === undefined ||
    totalCacheWriteTokens === undefined ||
    linesAdded === undefined ||
    linesRemoved === undefined ||
    filesTouched === undefined ||
    modelsUsed === undefined ||
    toolsUsed === undefined
  ) {
    return undefined;
  }

  return {
    promptCount,
    apiCallCount,
    toolCallCount,
    totalCostUsd,
    totalInputTokens,
    totalOutputTokens,
    totalCacheReadTokens,
    totalCacheWriteTokens,
    linesAdded,
    linesRemoved,
    filesTouched,
    modelsUsed,
    toolsUsed
  };
}

function parseCommitInfo(value: unknown, index: number, errors: string[]): CommitInfo | undefined {
  const path = `git.commits[${index}]`;
  if (!isRecord(value)) {
    addError(errors, path, "must be an object");
    return undefined;
  }

  const sha = readRequiredString(value, "sha", errors, `${path}.sha`);
  const promptId = readOptionalString(value, "promptId", errors, `${path}.promptId`);
  const message = readOptionalString(value, "message", errors, `${path}.message`);
  const linesAdded = readOptionalNonNegativeNumber(value, "linesAdded", errors, `${path}.linesAdded`);
  const linesRemoved = readOptionalNonNegativeNumber(value, "linesRemoved", errors, `${path}.linesRemoved`);
  const committedAt = readOptionalIsoDate(value, "committedAt", errors, `${path}.committedAt`);

  if (sha === undefined) {
    return undefined;
  }

  return {
    sha,
    ...(promptId !== undefined ? { promptId } : {}),
    ...(message !== undefined ? { message } : {}),
    ...(linesAdded !== undefined ? { linesAdded } : {}),
    ...(linesRemoved !== undefined ? { linesRemoved } : {}),
    ...(committedAt !== undefined ? { committedAt } : {})
  };
}

function parsePullRequestInfo(
  value: unknown,
  index: number,
  errors: string[]
): PullRequestInfo | undefined {
  const path = `git.pullRequests[${index}]`;
  if (!isRecord(value)) {
    addError(errors, path, "must be an object");
    return undefined;
  }

  const repo = readRequiredString(value, "repo", errors, `${path}.repo`);
  const prNumberRaw = value["prNumber"];
  const state = readRequiredString(value, "state", errors, `${path}.state`);
  const mergedAt = readOptionalIsoDate(value, "mergedAt", errors, `${path}.mergedAt`);

  if (!isPositiveInteger(prNumberRaw)) {
    addError(errors, `${path}.prNumber`, "must be a positive integer");
  }

  if (repo === undefined || state === undefined || !isPositiveInteger(prNumberRaw)) {
    return undefined;
  }

  return {
    repo,
    prNumber: prNumberRaw,
    state,
    ...(mergedAt !== undefined ? { mergedAt } : {})
  };
}

function parseSessionGit(value: unknown, errors: string[]): SessionGit | undefined {
  if (!isRecord(value)) {
    addError(errors, "git", "must be an object");
    return undefined;
  }

  const commitsRaw = value["commits"];
  const pullRequestsRaw = value["pullRequests"];

  if (!Array.isArray(commitsRaw)) {
    addError(errors, "git.commits", "must be an array");
  }
  if (!Array.isArray(pullRequestsRaw)) {
    addError(errors, "git.pullRequests", "must be an array");
  }

  const commits: CommitInfo[] = [];
  if (Array.isArray(commitsRaw)) {
    commitsRaw.forEach((entry, index) => {
      const commit = parseCommitInfo(entry, index, errors);
      if (commit !== undefined) {
        commits.push(commit);
      }
    });
  }

  const pullRequests: PullRequestInfo[] = [];
  if (Array.isArray(pullRequestsRaw)) {
    pullRequestsRaw.forEach((entry, index) => {
      const pullRequest = parsePullRequestInfo(entry, index, errors);
      if (pullRequest !== undefined) {
        pullRequests.push(pullRequest);
      }
    });
  }

  return {
    commits,
    pullRequests
  };
}

function failure<TValue>(errors: string[]): ValidationResult<TValue> {
  return {
    ok: false,
    value: undefined,
    errors
  };
}

function success<TValue>(value: TValue): ValidationResult<TValue> {
  return {
    ok: true,
    value,
    errors: []
  };
}

export function validateEventEnvelope(input: unknown): ValidationResult<EventEnvelope> {
  if (!isRecord(input)) {
    return failure(["event: must be an object"]);
  }

  const errors: string[] = [];

  const schemaVersionRaw = input["schemaVersion"];
  if (schemaVersionRaw !== SCHEMA_VERSION) {
    addError(errors, "schemaVersion", `must equal ${SCHEMA_VERSION}`);
  }

  const sourceRaw = input["source"];
  if (!isEventSource(sourceRaw)) {
    addError(errors, "source", `must be one of: ${EVENT_SOURCES.join(", ")}`);
  }

  const eventId = readRequiredString(input, "eventId", errors, "eventId");
  const sessionId = readRequiredString(input, "sessionId", errors, "sessionId");
  const promptId = readOptionalString(input, "promptId", errors, "promptId");
  const eventType = readRequiredString(input, "eventType", errors, "eventType");
  const eventTimestamp = readRequiredIsoDate(input, "eventTimestamp", errors, "eventTimestamp");
  const ingestedAt = readRequiredIsoDate(input, "ingestedAt", errors, "ingestedAt");

  const privacyTierRaw = input["privacyTier"];
  if (!isPrivacyTier(privacyTierRaw)) {
    addError(errors, "privacyTier", `must be one of: ${PRIVACY_TIERS.join(", ")}`);
  }

  const sourceVersion = readOptionalString(input, "sourceVersion", errors, "sourceVersion");
  const attributes = parseAttributes(input, errors);

  const hasPayload = Object.prototype.hasOwnProperty.call(input, "payload");
  if (!hasPayload) {
    addError(errors, "payload", "is required");
  }
  const payload = input["payload"];

  if (
    errors.length > 0 ||
    !isEventSource(sourceRaw) ||
    !isPrivacyTier(privacyTierRaw) ||
    eventId === undefined ||
    sessionId === undefined ||
    eventType === undefined ||
    eventTimestamp === undefined ||
    ingestedAt === undefined
  ) {
    return failure(errors);
  }

  const eventEnvelope: EventEnvelope = {
    schemaVersion: SCHEMA_VERSION,
    source: sourceRaw,
    ...(sourceVersion !== undefined ? { sourceVersion } : {}),
    eventId,
    sessionId,
    ...(promptId !== undefined ? { promptId } : {}),
    eventType,
    eventTimestamp,
    ingestedAt,
    privacyTier: privacyTierRaw,
    payload,
    ...(attributes !== undefined ? { attributes } : {})
  };

  return success(eventEnvelope);
}

export function validateSessionTrace(input: unknown): ValidationResult<AgentSessionTrace> {
  if (!isRecord(input)) {
    return failure(["sessionTrace: must be an object"]);
  }

  const errors: string[] = [];

  const sessionId = readRequiredString(input, "sessionId", errors, "sessionId");
  const agentTypeRaw = input["agentType"];
  if (!isAgentType(agentTypeRaw)) {
    addError(errors, "agentType", `must be one of: ${AGENT_TYPES.join(", ")}`);
  }

  const user = parseSessionUser(input["user"], errors);
  const environment = parseSessionEnvironment(input["environment"], errors);
  const startedAt = readRequiredIsoDate(input, "startedAt", errors, "startedAt");
  const endedAt = readOptionalIsoDate(input, "endedAt", errors, "endedAt");
  const activeDurationMs = readRequiredNonNegativeNumber(
    input,
    "activeDurationMs",
    errors,
    "activeDurationMs"
  );

  const timelineRaw = input["timeline"];
  if (!Array.isArray(timelineRaw)) {
    addError(errors, "timeline", "must be an array");
  }
  const timeline: TimelineEvent[] = [];
  if (Array.isArray(timelineRaw)) {
    timelineRaw.forEach((entry, index) => {
      const event = parseTimelineEvent(entry, index, errors);
      if (event !== undefined) {
        timeline.push(event);
      }
    });
  }

  const metrics = parseSessionMetrics(input["metrics"], errors);
  const git = parseSessionGit(input["git"], errors);

  if (
    errors.length > 0 ||
    sessionId === undefined ||
    !isAgentType(agentTypeRaw) ||
    user === undefined ||
    environment === undefined ||
    startedAt === undefined ||
    activeDurationMs === undefined ||
    metrics === undefined ||
    git === undefined
  ) {
    return failure(errors);
  }

  const sessionTrace: AgentSessionTrace = {
    sessionId,
    agentType: agentTypeRaw,
    user,
    environment,
    startedAt,
    ...(endedAt !== undefined ? { endedAt } : {}),
    activeDurationMs,
    timeline,
    metrics,
    git
  };

  return success(sessionTrace);
}
