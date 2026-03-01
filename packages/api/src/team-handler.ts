import { toSessionSummary } from "./mapper";
import type {
  ApiHandlerDependencies,
  ApiRequest,
  ApiResponse,
  ApiTeamBudget,
  ApiTeamCostDailyMemberBreakdown,
  ApiTeamCostDailyPoint,
  ApiTeamCostDailyResponse,
  ApiTeamMember,
  ApiTeamMembersResponse,
  ApiTeamOverviewResponse,
  ApiTeamBudgetResponse,
  ApiTeamBudgetSaveResponse,
  SessionFilters
} from "./types";

function currentYearMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

function defaultDateRange(): { from: string; to: string } {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const from = `${year}-${month}-01`;
  const lastDay = new Date(year, now.getMonth() + 1, 0).getDate();
  const to = `${year}-${month}-${String(lastDay).padStart(2, "0")}`;
  return { from, to };
}

function parseDateRange(searchParams: URLSearchParams): { from: string; to: string } {
  const fromParam = searchParams.get("from");
  const toParam = searchParams.get("to");
  const defaults = defaultDateRange();
  return {
    from: fromParam !== null && fromParam.length === 10 ? fromParam : defaults.from,
    to: toParam !== null && toParam.length === 10 ? toParam : defaults.to
  };
}

function toMetricDate(startedAt: string): string {
  const parsed = Date.parse(startedAt);
  if (Number.isNaN(parsed)) {
    return startedAt.slice(0, 10);
  }
  return new Date(parsed).toISOString().slice(0, 10);
}

export function handleTeamOverview(
  searchParams: URLSearchParams,
  dependencies: ApiHandlerDependencies
): ApiResponse {
  const { from, to } = parseDateRange(searchParams);
  const filters: SessionFilters = { from, to };
  const traces = dependencies.repository.list(filters);

  let totalCostUsd = 0;
  let totalCommits = 0;
  let totalPullRequests = 0;
  let totalLinesAdded = 0;
  let totalLinesRemoved = 0;
  const memberIds = new Set<string>();

  for (const trace of traces) {
    totalCostUsd += trace.metrics.totalCostUsd;
    totalCommits += trace.git.commits.length;
    totalPullRequests += trace.git.pullRequests.length;
    totalLinesAdded += trace.metrics.linesAdded;
    totalLinesRemoved += trace.metrics.linesRemoved;
    if (trace.user.id !== "unknown_user") {
      memberIds.add(trace.user.id);
    }
  }

  const payload: ApiTeamOverviewResponse = {
    status: "ok",
    period: { from, to },
    totalCostUsd: Number(totalCostUsd.toFixed(6)),
    totalSessions: traces.length,
    totalCommits,
    totalPullRequests,
    totalLinesAdded,
    totalLinesRemoved,
    memberCount: memberIds.size,
    costPerCommit: totalCommits > 0 ? Number((totalCostUsd / totalCommits).toFixed(2)) : 0,
    costPerPullRequest: totalPullRequests > 0 ? Number((totalCostUsd / totalPullRequests).toFixed(2)) : 0
  };

  return { statusCode: 200, payload };
}

export function handleTeamMembers(
  searchParams: URLSearchParams,
  dependencies: ApiHandlerDependencies
): ApiResponse {
  const { from, to } = parseDateRange(searchParams);
  const filters: SessionFilters = { from, to };
  const traces = dependencies.repository.list(filters);

  const memberMap = new Map<
    string,
    {
      displayName: string | null;
      sessionCount: number;
      totalCostUsd: number;
      commitCount: number;
      prCount: number;
      linesAdded: number;
      linesRemoved: number;
      lastActiveAt: string;
    }
  >();

  for (const trace of traces) {
    const userId = trace.user.id;
    if (userId === "unknown_user") continue;

    const existing = memberMap.get(userId) ?? {
      displayName: trace.user.displayName ?? null,
      sessionCount: 0,
      totalCostUsd: 0,
      commitCount: 0,
      prCount: 0,
      linesAdded: 0,
      linesRemoved: 0,
      lastActiveAt: trace.startedAt
    };

    existing.sessionCount += 1;
    existing.totalCostUsd += trace.metrics.totalCostUsd;
    existing.commitCount += trace.git.commits.length;
    existing.prCount += trace.git.pullRequests.length;
    existing.linesAdded += trace.metrics.linesAdded;
    existing.linesRemoved += trace.metrics.linesRemoved;

    if (trace.user.displayName !== undefined) {
      existing.displayName = trace.user.displayName;
    }

    const traceEnd = trace.endedAt ?? trace.startedAt;
    if (traceEnd > existing.lastActiveAt) {
      existing.lastActiveAt = traceEnd;
    }

    memberMap.set(userId, existing);
  }

  const members: ApiTeamMember[] = [...memberMap.entries()]
    .map(([userId, data]) => ({
      userId,
      displayName: data.displayName,
      sessionCount: data.sessionCount,
      totalCostUsd: Number(data.totalCostUsd.toFixed(6)),
      commitCount: data.commitCount,
      prCount: data.prCount,
      linesAdded: data.linesAdded,
      linesRemoved: data.linesRemoved,
      costPerCommit: data.commitCount > 0 ? Number((data.totalCostUsd / data.commitCount).toFixed(2)) : 0,
      lastActiveAt: data.lastActiveAt
    }))
    .sort((a, b) => b.totalCostUsd - a.totalCostUsd);

  const payload: ApiTeamMembersResponse = { status: "ok", members };
  return { statusCode: 200, payload };
}

export function handleTeamCostDaily(
  searchParams: URLSearchParams,
  dependencies: ApiHandlerDependencies
): ApiResponse {
  const { from, to } = parseDateRange(searchParams);
  const filters: SessionFilters = { from, to };
  const traces = dependencies.repository.list(filters);

  const byDate = new Map<
    string,
    {
      totalCostUsd: number;
      sessionCount: number;
      byMember: Map<string, { totalCostUsd: number; sessionCount: number }>;
    }
  >();

  for (const trace of traces) {
    const date = toMetricDate(trace.startedAt);
    const entry = byDate.get(date) ?? {
      totalCostUsd: 0,
      sessionCount: 0,
      byMember: new Map()
    };

    entry.totalCostUsd += trace.metrics.totalCostUsd;
    entry.sessionCount += 1;

    const userId = trace.user.id;
    const memberEntry = entry.byMember.get(userId) ?? { totalCostUsd: 0, sessionCount: 0 };
    memberEntry.totalCostUsd += trace.metrics.totalCostUsd;
    memberEntry.sessionCount += 1;
    entry.byMember.set(userId, memberEntry);

    byDate.set(date, entry);
  }

  const points: ApiTeamCostDailyPoint[] = [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, entry]) => {
      const byMember: ApiTeamCostDailyMemberBreakdown[] = [...entry.byMember.entries()].map(
        ([userId, m]) => ({
          userId,
          totalCostUsd: Number(m.totalCostUsd.toFixed(6)),
          sessionCount: m.sessionCount
        })
      );
      return {
        date,
        totalCostUsd: Number(entry.totalCostUsd.toFixed(6)),
        sessionCount: entry.sessionCount,
        byMember
      };
    });

  const payload: ApiTeamCostDailyResponse = { status: "ok", points };
  return { statusCode: 200, payload };
}

export function handleGetTeamBudget(
  dependencies: ApiHandlerDependencies
): ApiResponse {
  const budget = dependencies.teamBudgetStore?.getTeamBudget() ?? null;
  const yearMonth = currentYearMonth();
  const currentMonthSpend = dependencies.teamBudgetStore?.getMonthSpend(yearMonth) ?? 0;
  const percentUsed = budget !== null && budget.monthlyLimitUsd > 0
    ? Number(((currentMonthSpend / budget.monthlyLimitUsd) * 100).toFixed(1))
    : 0;

  const payload: ApiTeamBudgetResponse = {
    status: "ok",
    budget,
    currentMonthSpend: Number(currentMonthSpend.toFixed(6)),
    percentUsed
  };
  return { statusCode: 200, payload };
}

export function handlePostTeamBudget(
  body: unknown,
  dependencies: ApiHandlerDependencies
): ApiResponse {
  if (dependencies.teamBudgetStore === undefined) {
    return {
      statusCode: 501,
      payload: { status: "error", message: "budget storage not available" }
    };
  }

  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return {
      statusCode: 400,
      payload: { status: "error", message: "invalid request body" }
    };
  }

  const record = body as Record<string, unknown>;
  const monthlyLimitUsd = record["monthlyLimitUsd"];
  if (typeof monthlyLimitUsd !== "number" || !Number.isFinite(monthlyLimitUsd) || monthlyLimitUsd < 0) {
    return {
      statusCode: 400,
      payload: { status: "error", message: "monthlyLimitUsd must be a non-negative number" }
    };
  }

  const alertThresholdPercent =
    typeof record["alertThresholdPercent"] === "number" &&
    Number.isFinite(record["alertThresholdPercent"]) &&
    (record["alertThresholdPercent"] as number) >= 0
      ? (record["alertThresholdPercent"] as number)
      : 80;

  dependencies.teamBudgetStore.upsertTeamBudget(monthlyLimitUsd, alertThresholdPercent);

  const payload: ApiTeamBudgetSaveResponse = {
    status: "ok",
    budget: { monthlyLimitUsd, alertThresholdPercent }
  };
  return { statusCode: 200, payload };
}
