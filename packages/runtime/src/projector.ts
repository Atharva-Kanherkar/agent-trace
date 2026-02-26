import type { AgentSessionTrace, TimelineEvent } from "../../schema/src/types";
import { calculateCostUsd } from "../../schema/src/pricing";
import type { RuntimeEnvelope } from "./types";

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }
  return value as UnknownRecord;
}

function readString(payload: UnknownRecord | undefined, keys: readonly string[]): string | undefined {
  if (payload === undefined) {
    return undefined;
  }

  for (const key of keys) {
    const value = payload[key];
    if (typeof value === "string" && value.length > 0) {
      return value;
    }
  }
  return undefined;
}

function readNumber(payload: UnknownRecord | undefined, keys: readonly string[]): number | undefined {
  if (payload === undefined) {
    return undefined;
  }

  for (const key of keys) {
    const value = payload[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
  }
  return undefined;
}

function readNonEmptyString(payload: UnknownRecord | undefined, keys: readonly string[]): string | undefined {
  const value = readString(payload, keys);
  if (value === undefined || value.length === 0) {
    return undefined;
  }
  return value;
}

function readStringArray(payload: UnknownRecord | undefined, keys: readonly string[]): readonly string[] {
  if (payload === undefined) {
    return [];
  }

  for (const key of keys) {
    const value = payload[key];
    if (Array.isArray(value)) {
      const items = value.filter((item): item is string => typeof item === "string" && item.length > 0);
      return items;
    }
  }

  return [];
}

function uniqueMerge(existing: readonly string[], additions: readonly string[]): readonly string[] {
  const set = new Set<string>(existing);
  additions.forEach((item) => {
    set.add(item);
  });
  return [...set];
}

function timelineContainsEvent(trace: AgentSessionTrace, eventId: string): boolean {
  return trace.timeline.some((event) => event.id === eventId);
}

function addCamelAlias(target: Record<string, unknown>, snakeKey: string, camelKey: string): void {
  if (target[snakeKey] !== undefined && target[camelKey] === undefined) {
    target[camelKey] = target[snakeKey];
  }
}

function buildNormalizedDetails(payload: unknown): Readonly<Record<string, unknown>> | undefined {
  const record = asRecord(payload);
  if (record === undefined) {
    return undefined;
  }

  const normalized: Record<string, unknown> = { ...record };
  addCamelAlias(normalized, "tool_name", "toolName");
  addCamelAlias(normalized, "tool_input", "toolInput");
  addCamelAlias(normalized, "tool_response", "toolResponse");
  addCamelAlias(normalized, "tool_duration_ms", "toolDurationMs");
  addCamelAlias(normalized, "prompt_text", "promptText");
  addCamelAlias(normalized, "hook_event_name", "hookEventName");
  addCamelAlias(normalized, "tool_use_id", "toolUseId");
  addCamelAlias(normalized, "last_assistant_message", "lastAssistantMessage");
  addCamelAlias(normalized, "response_text", "responseText");
  addCamelAlias(normalized, "file_path", "filePath");
  return normalized;
}

function computeEventCost(payload: UnknownRecord | undefined): number | undefined {
  const explicit = readNumber(payload, ["cost_usd", "costUsd"]);
  if (explicit !== undefined && explicit > 0) {
    return explicit;
  }

  const model = readString(payload, ["model"]);
  const inputTokens = readNumber(payload, ["input_tokens", "inputTokens"]);
  const outputTokens = readNumber(payload, ["output_tokens", "outputTokens"]);
  if (model === undefined || inputTokens === undefined || outputTokens === undefined) {
    return explicit;
  }

  const cacheReadTokens = readNumber(payload, ["cache_read_tokens", "cacheReadTokens", "cache_read_input_tokens"]);
  const cacheWriteTokens = readNumber(payload, ["cache_write_tokens", "cacheWriteTokens", "cache_creation_input_tokens"]);

  const calculated = calculateCostUsd({
    model,
    inputTokens,
    outputTokens,
    cacheReadTokens: cacheReadTokens ?? 0,
    cacheWriteTokens: cacheWriteTokens ?? 0
  });

  return calculated > 0 ? calculated : explicit;
}

function toTimelineEvent(envelope: RuntimeEnvelope): TimelineEvent {
  const payload = asRecord(envelope.payload);
  const inputTokens = readNumber(payload, ["input_tokens", "inputTokens"]);
  const outputTokens = readNumber(payload, ["output_tokens", "outputTokens"]);
  const costUsd = computeEventCost(payload);
  const details = buildNormalizedDetails(envelope.payload);

  return {
    id: envelope.eventId,
    type: envelope.eventType,
    timestamp: envelope.eventTimestamp,
    ...(envelope.promptId !== undefined ? { promptId: envelope.promptId } : {}),
    ...(costUsd !== undefined ? { costUsd } : {}),
    ...(inputTokens !== undefined && outputTokens !== undefined
      ? {
          tokens: {
            input: inputTokens,
            output: outputTokens
          }
        }
      : {}),
    ...(details !== undefined ? { details } : {})
  };
}

function toBaseTrace(envelope: RuntimeEnvelope): AgentSessionTrace {
  const payload = asRecord(envelope.payload);
  const gitRepo = readString(payload, ["git_repo", "gitRepo"]);
  const gitBranch = readString(payload, ["git_branch", "gitBranch"]);
  const projectPath = readString(payload, ["project_path", "projectPath"]);
  const userId = readString(payload, ["user_id", "userId"]) ?? "unknown_user";

  return {
    sessionId: envelope.sessionId,
    agentType: "claude_code",
    user: {
      id: userId
    },
    environment: {
      ...(projectPath !== undefined ? { projectPath } : {}),
      ...(gitRepo !== undefined ? { gitRepo } : {}),
      ...(gitBranch !== undefined ? { gitBranch } : {})
    },
    startedAt: envelope.eventTimestamp,
    activeDurationMs: 0,
    timeline: [],
    metrics: {
      promptCount: 0,
      apiCallCount: 0,
      toolCallCount: 0,
      totalCostUsd: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      linesAdded: 0,
      linesRemoved: 0,
      filesTouched: [],
      modelsUsed: [],
      toolsUsed: []
    },
    git: {
      commits: [],
      pullRequests: []
    }
  };
}

function updateDurationMs(startedAt: string, endedAt: string): number {
  const startMs = Date.parse(startedAt);
  const endMs = Date.parse(endedAt);
  if (Number.isNaN(startMs) || Number.isNaN(endMs) || endMs < startMs) {
    return 0;
  }
  return endMs - startMs;
}

function shouldMarkEnded(eventType: string): boolean {
  const normalized = eventType.toLowerCase();
  return (
    normalized === "session_end" ||
    normalized === "sessionend" ||
    normalized === "stop" ||
    normalized === "task_completed" ||
    normalized === "taskcompleted"
  );
}

function incrementMetricIfMatches(metric: number, eventType: string, match: readonly string[]): number {
  const normalized = eventType.toLowerCase();
  const shouldIncrement = match.some((entry) => normalized.includes(entry));
  return shouldIncrement ? metric + 1 : metric;
}

function toUpdatedTrace(existing: AgentSessionTrace, envelope: RuntimeEnvelope): AgentSessionTrace {
  if (timelineContainsEvent(existing, envelope.eventId)) {
    return existing;
  }

  const payload = asRecord(envelope.payload);
  const timelineEvent = toTimelineEvent(envelope);
  const mergedTimeline = [...existing.timeline, timelineEvent];
  const endedAt = shouldMarkEnded(envelope.eventType) ? envelope.eventTimestamp : existing.endedAt;
  const latestTime = endedAt ?? envelope.eventTimestamp;

  const cost = computeEventCost(payload) ?? 0;
  const inputTokens = readNumber(payload, ["input_tokens", "inputTokens"]) ?? 0;
  const outputTokens = readNumber(payload, ["output_tokens", "outputTokens"]) ?? 0;
  const linesAdded = readNumber(payload, ["lines_added", "linesAdded"]) ?? 0;
  const linesRemoved = readNumber(payload, ["lines_removed", "linesRemoved"]) ?? 0;

  const model = readString(payload, ["model"]);
  const toolName = readString(payload, ["tool_name", "toolName"]);
  const filesTouchedFromArray = readStringArray(payload, ["files_changed", "filesChanged"]);
  const singleFileTouched = readString(payload, ["file_path", "filePath"]);
  const filesTouched = uniqueMerge(
    existing.metrics.filesTouched,
    singleFileTouched !== undefined ? [...filesTouchedFromArray, singleFileTouched] : filesTouchedFromArray
  );

  const existingCommits = [...existing.git.commits];
  const commitSha = readString(payload, ["commit_sha", "commitSha"]);
  const isCommitEvent = payload !== undefined && payload["is_commit"] === true;
  const commitMessage = readNonEmptyString(payload, ["commit_message", "commitMessage"]);
  if (
    commitSha !== undefined &&
    (isCommitEvent || commitMessage !== undefined) &&
    !existingCommits.some((commit) => commit.sha === commitSha)
  ) {
    const commitLinesAdded = readNumber(payload, ["lines_added", "linesAdded"]);
    const commitLinesRemoved = readNumber(payload, ["lines_removed", "linesRemoved"]);
    existingCommits.push({
      sha: commitSha,
      ...(envelope.promptId !== undefined ? { promptId: envelope.promptId } : {}),
      ...(commitMessage !== undefined ? { message: commitMessage } : {}),
      ...(commitLinesAdded !== undefined ? { linesAdded: commitLinesAdded } : {}),
      ...(commitLinesRemoved !== undefined ? { linesRemoved: commitLinesRemoved } : {}),
      committedAt: envelope.eventTimestamp
    });
  }

  const existingPullRequests = [...existing.git.pullRequests];
  const prUrl = readString(payload, ["pr_url", "prUrl"]);
  const prRepo = readString(payload, ["pr_repo", "prRepo"]);
  const prNumberRaw = readNumber(payload, ["pr_number", "prNumber"]);
  if (prUrl !== undefined && prRepo !== undefined && prNumberRaw !== undefined) {
    const alreadyTracked = existingPullRequests.some((pr) => pr.prNumber === prNumberRaw && pr.repo === prRepo);
    if (!alreadyTracked) {
      existingPullRequests.push({
        repo: prRepo,
        prNumber: prNumberRaw,
        state: "open",
        url: prUrl
      });
    }
  }

  return {
    ...existing,
    ...(endedAt !== undefined ? { endedAt } : {}),
    activeDurationMs: updateDurationMs(existing.startedAt, latestTime),
    timeline: mergedTimeline,
    metrics: {
      promptCount: incrementMetricIfMatches(existing.metrics.promptCount, envelope.eventType, ["prompt"]),
      apiCallCount: incrementMetricIfMatches(existing.metrics.apiCallCount, envelope.eventType, ["api"]),
      toolCallCount: incrementMetricIfMatches(existing.metrics.toolCallCount, envelope.eventType, ["tool"]),
      totalCostUsd: Number((existing.metrics.totalCostUsd + cost).toFixed(6)),
      totalInputTokens: existing.metrics.totalInputTokens + inputTokens,
      totalOutputTokens: existing.metrics.totalOutputTokens + outputTokens,
      linesAdded: existing.metrics.linesAdded + linesAdded,
      linesRemoved: existing.metrics.linesRemoved + linesRemoved,
      filesTouched,
      modelsUsed: model !== undefined ? uniqueMerge(existing.metrics.modelsUsed, [model]) : existing.metrics.modelsUsed,
      toolsUsed:
        toolName !== undefined ? uniqueMerge(existing.metrics.toolsUsed, [toolName]) : existing.metrics.toolsUsed
    },
    git: {
      ...existing.git,
      commits: existingCommits,
      pullRequests: existingPullRequests
    }
  };
}

export function projectEnvelopeToTrace(
  currentTrace: AgentSessionTrace | undefined,
  envelope: RuntimeEnvelope
): AgentSessionTrace {
  const base = currentTrace ?? toBaseTrace(envelope);
  return toUpdatedTrace(base, envelope);
}
