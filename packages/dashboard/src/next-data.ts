import type {
  UiCostDailyPoint,
  UiHomeLoadResult,
  UiSessionCommit,
  UiSessionReplay,
  UiSessionReplayEvent,
  UiSessionSummary
} from "./next-types";

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }
  return value as UnknownRecord;
}

function readString(record: UnknownRecord, key: string): string | undefined {
  const value = record[key];
  if (typeof value === "string" && value.length > 0) {
    return value;
  }
  return undefined;
}

function readNullableString(record: UnknownRecord, key: string): string | null | undefined {
  const value = record[key];
  if (value === null) {
    return null;
  }
  if (typeof value === "string") {
    return value;
  }
  return undefined;
}

function readNumber(record: UnknownRecord, key: string): number | undefined {
  const value = record[key];
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  return undefined;
}

function readStringArray(record: UnknownRecord, key: string): readonly string[] {
  const value = record[key];
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === "string" && item.length > 0);
}

function normalizeApiBaseUrl(input: string): string {
  if (input.endsWith("/")) {
    return input.slice(0, -1);
  }
  return input;
}

export function getDashboardApiBaseUrl(): string {
  return normalizeApiBaseUrl(process.env["DASHBOARD_API_BASE_URL"] ?? "http://127.0.0.1:8318");
}

async function fetchApiJson(pathname: string): Promise<unknown> {
  const response = await fetch(`${getDashboardApiBaseUrl()}${pathname}`, {
    cache: "no-store"
  });
  if (!response.ok) {
    throw new Error(`api returned status ${String(response.status)} for ${pathname}`);
  }
  return (await response.json()) as unknown;
}

function parseSessionSummary(value: unknown): UiSessionSummary | undefined {
  const record = asRecord(value);
  if (record === undefined) {
    return undefined;
  }

  const sessionId = readString(record, "sessionId");
  const userId = readString(record, "userId");
  const startedAt = readString(record, "startedAt");
  const endedAt = readNullableString(record, "endedAt");
  if (sessionId === undefined || userId === undefined || startedAt === undefined || endedAt === undefined) {
    return undefined;
  }

  return {
    sessionId,
    userId,
    gitRepo: readNullableString(record, "gitRepo") ?? null,
    gitBranch: readNullableString(record, "gitBranch") ?? null,
    startedAt,
    endedAt,
    promptCount: readNumber(record, "promptCount") ?? 0,
    toolCallCount: readNumber(record, "toolCallCount") ?? 0,
    totalCostUsd: readNumber(record, "totalCostUsd") ?? 0,
    commitCount: readNumber(record, "commitCount") ?? 0,
    linesAdded: readNumber(record, "linesAdded") ?? 0,
    linesRemoved: readNumber(record, "linesRemoved") ?? 0
  };
}

function parseCostPoint(value: unknown): UiCostDailyPoint | undefined {
  const record = asRecord(value);
  if (record === undefined) {
    return undefined;
  }

  const date = readString(record, "date");
  if (date === undefined) {
    return undefined;
  }

  return {
    date,
    totalCostUsd: readNumber(record, "totalCostUsd") ?? 0,
    sessionCount: readNumber(record, "sessionCount") ?? 0,
    promptCount: readNumber(record, "promptCount") ?? 0,
    toolCallCount: readNumber(record, "toolCallCount") ?? 0
  };
}

function parseCommit(value: unknown): UiSessionCommit | undefined {
  const record = asRecord(value);
  if (record === undefined) {
    return undefined;
  }
  const sha = readString(record, "sha");
  if (sha === undefined) {
    return undefined;
  }
  return {
    sha,
    ...(readString(record, "message") !== undefined ? { message: readString(record, "message") } : {}),
    ...(readString(record, "promptId") !== undefined ? { promptId: readString(record, "promptId") } : {}),
    ...(readString(record, "committedAt") !== undefined ? { committedAt: readString(record, "committedAt") } : {})
  };
}

function parseReplayEvent(value: unknown): UiSessionReplayEvent | undefined {
  const record = asRecord(value);
  if (record === undefined) {
    return undefined;
  }

  const id = readString(record, "id");
  const type = readString(record, "type");
  const timestamp = readString(record, "timestamp");
  if (id === undefined || type === undefined || timestamp === undefined) {
    return undefined;
  }

  const promptId = readString(record, "promptId");
  const status = readString(record, "status");
  const costUsd = readNumber(record, "costUsd");
  const tokens = asRecord(record["tokens"]);
  const inputTokens = tokens === undefined ? undefined : readNumber(tokens, "input");
  const outputTokens = tokens === undefined ? undefined : readNumber(tokens, "output");
  const details = asRecord(record["details"]);
  const toolName = details === undefined ? undefined : readString(details, "toolName");
  const toolDurationMs = details === undefined ? undefined : readNumber(details, "toolDurationMs");
  const detail = details === undefined ? undefined : readString(details, "promptText") ?? readString(details, "command");

  return {
    id,
    type,
    timestamp,
    ...(promptId !== undefined ? { promptId } : {}),
    ...(status !== undefined ? { status } : {}),
    ...(costUsd !== undefined ? { costUsd } : {}),
    ...(toolName !== undefined ? { toolName } : {}),
    ...(toolDurationMs !== undefined ? { toolDurationMs } : {}),
    ...(inputTokens !== undefined ? { inputTokens } : {}),
    ...(outputTokens !== undefined ? { outputTokens } : {}),
    ...(detail !== undefined ? { detail } : {}),
    ...(details !== undefined ? { details } : {}),
    ...(tokens !== undefined ? { tokens } : {})
  };
}

export async function fetchSessionSummaries(): Promise<readonly UiSessionSummary[]> {
  const payload = asRecord(await fetchApiJson("/v1/sessions"));
  if (payload === undefined) {
    throw new Error("sessions payload is not an object");
  }

  const status = readString(payload, "status");
  const sessionsRaw = payload["sessions"];
  if (status !== "ok" || !Array.isArray(sessionsRaw)) {
    throw new Error("sessions payload is invalid");
  }

  return sessionsRaw.map((entry) => parseSessionSummary(entry)).filter(
    (entry): entry is UiSessionSummary => entry !== undefined
  );
}

export async function fetchDailyCostPoints(): Promise<readonly UiCostDailyPoint[]> {
  const payload = asRecord(await fetchApiJson("/v1/analytics/cost/daily"));
  if (payload === undefined) {
    throw new Error("daily cost payload is not an object");
  }

  const status = readString(payload, "status");
  const pointsRaw = payload["points"];
  if (status !== "ok" || !Array.isArray(pointsRaw)) {
    throw new Error("daily cost payload is invalid");
  }

  return pointsRaw.map((entry) => parseCostPoint(entry)).filter(
    (entry): entry is UiCostDailyPoint => entry !== undefined
  );
}

export async function fetchSessionReplay(sessionId: string): Promise<UiSessionReplay | undefined> {
  const response = await fetch(`${getDashboardApiBaseUrl()}/v1/sessions/${encodeURIComponent(sessionId)}`, {
    cache: "no-store"
  });
  if (response.status === 404) {
    return undefined;
  }
  if (!response.ok) {
    throw new Error(`api returned status ${String(response.status)} for session ${sessionId}`);
  }

  const payload = asRecord((await response.json()) as unknown);
  if (payload === undefined || readString(payload, "status") !== "ok") {
    throw new Error("session replay payload is invalid");
  }
  const sessionRecord = asRecord(payload["session"]);
  if (sessionRecord === undefined) {
    throw new Error("session replay payload missing session");
  }

  const parsedSessionId = readString(sessionRecord, "sessionId");
  const startedAt = readString(sessionRecord, "startedAt");
  const metricsRecord = asRecord(sessionRecord["metrics"]);
  const timelineRaw = sessionRecord["timeline"];
  if (
    parsedSessionId === undefined ||
    startedAt === undefined ||
    metricsRecord === undefined ||
    !Array.isArray(timelineRaw)
  ) {
    throw new Error("session replay payload shape is invalid");
  }

  const endedAt = readString(sessionRecord, "endedAt");
  const gitRecord = asRecord(sessionRecord["git"]);
  const commitsRaw = gitRecord !== undefined && Array.isArray(gitRecord["commits"]) ? gitRecord["commits"] : [];

  return {
    sessionId: parsedSessionId,
    startedAt,
    ...(endedAt !== undefined ? { endedAt } : {}),
    metrics: {
      promptCount: readNumber(metricsRecord, "promptCount") ?? 0,
      toolCallCount: readNumber(metricsRecord, "toolCallCount") ?? 0,
      totalCostUsd: readNumber(metricsRecord, "totalCostUsd") ?? 0,
      totalInputTokens: readNumber(metricsRecord, "totalInputTokens") ?? 0,
      totalOutputTokens: readNumber(metricsRecord, "totalOutputTokens") ?? 0,
      linesAdded: readNumber(metricsRecord, "linesAdded") ?? 0,
      linesRemoved: readNumber(metricsRecord, "linesRemoved") ?? 0,
      modelsUsed: readStringArray(metricsRecord, "modelsUsed"),
      toolsUsed: readStringArray(metricsRecord, "toolsUsed"),
      filesTouched: readStringArray(metricsRecord, "filesTouched")
    },
    commits: commitsRaw.map((entry) => parseCommit(entry)).filter(
      (entry): entry is UiSessionCommit => entry !== undefined
    ),
    timeline: timelineRaw.map((entry) => parseReplayEvent(entry)).filter(
      (entry): entry is UiSessionReplayEvent => entry !== undefined
    )
  };
}

export async function fetchHomeData(): Promise<UiHomeLoadResult> {
  try {
    const [sessions, costPoints] = await Promise.all([fetchSessionSummaries(), fetchDailyCostPoints()]);
    return {
      data: {
        sessions,
        costPoints
      }
    };
  } catch (error: unknown) {
    return {
      data: {
        sessions: [],
        costPoints: []
      },
      warning: String(error)
    };
  }
}
