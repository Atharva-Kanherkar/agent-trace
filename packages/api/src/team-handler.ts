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
  ApiTeamAnalyticsMember,
  ApiTeamAnalyticsModelUsage,
  ApiTeamAnalyticsToolUsage,
  ApiTeamAnalyticsRepoUsage,
  ApiTeamAnalyticsHeatmapCell,
  ApiTeamAnalyticsCostTrendPoint,
  ApiTeamAnalyticsResponse,
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

export function handleTeamAnalytics(
  searchParams: URLSearchParams,
  dependencies: ApiHandlerDependencies
): ApiResponse {
  const { from, to } = parseDateRange(searchParams);
  const filters: SessionFilters = { from, to };
  const traces = dependencies.repository.list(filters);

  // Per-member accumulators
  const memberMap = new Map<
    string,
    {
      displayName: string | null;
      totalCostUsd: number;
      sessionCount: number;
      commitCount: number;
      prCount: number;
      linesAdded: number;
      linesRemoved: number;
      totalInputTokens: number;
      totalOutputTokens: number;
      models: Map<string, { count: number; costUsd: number }>;
      tools: Map<string, number>;
      repos: Map<string, { sessions: number; commits: number }>;
      hourlyActivity: number[];
      dailyActivity: number[];
    }
  >();

  // Team-wide accumulators
  const teamModels = new Map<string, { count: number; costUsd: number }>();
  const teamTools = new Map<string, number>();
  const heatmap = new Map<string, number>(); // "hour-day" -> count
  const dailyCost = new Map<string, { costUsd: number; sessions: number }>();
  let totalCost = 0;
  let totalCommits = 0;
  let totalTokens = 0;

  for (const trace of traces) {
    const userId = trace.user.id;
    if (userId === "unknown_user") continue;

    const startDate = new Date(trace.startedAt);
    const hour = startDate.getUTCHours();
    const dayOfWeek = startDate.getUTCDay();
    const dateStr = toMetricDate(trace.startedAt);

    // Initialize member accumulator
    const member = memberMap.get(userId) ?? {
      displayName: trace.user.displayName ?? null,
      totalCostUsd: 0,
      sessionCount: 0,
      commitCount: 0,
      prCount: 0,
      linesAdded: 0,
      linesRemoved: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      models: new Map(),
      tools: new Map(),
      repos: new Map(),
      hourlyActivity: new Array(24).fill(0) as number[],
      dailyActivity: new Array(7).fill(0) as number[]
    };

    member.totalCostUsd += trace.metrics.totalCostUsd;
    member.sessionCount += 1;
    member.commitCount += trace.git.commits.length;
    member.prCount += trace.git.pullRequests.length;
    member.linesAdded += trace.metrics.linesAdded;
    member.linesRemoved += trace.metrics.linesRemoved;
    member.totalInputTokens += trace.metrics.totalInputTokens;
    member.totalOutputTokens += trace.metrics.totalOutputTokens;
    member.hourlyActivity[hour] = (member.hourlyActivity[hour] ?? 0) + 1;
    member.dailyActivity[dayOfWeek] = (member.dailyActivity[dayOfWeek] ?? 0) + 1;

    if (trace.user.displayName !== undefined) {
      member.displayName = trace.user.displayName;
    }

    // Model usage - distribute cost evenly across models
    const costPerModel = trace.metrics.modelsUsed.length > 0
      ? trace.metrics.totalCostUsd / trace.metrics.modelsUsed.length
      : 0;
    for (const model of trace.metrics.modelsUsed) {
      const existing = member.models.get(model) ?? { count: 0, costUsd: 0 };
      existing.count += 1;
      existing.costUsd += costPerModel;
      member.models.set(model, existing);

      const teamEntry = teamModels.get(model) ?? { count: 0, costUsd: 0 };
      teamEntry.count += 1;
      teamEntry.costUsd += costPerModel;
      teamModels.set(model, teamEntry);
    }

    // Tool usage - count from toolsUsed array + timeline for call counts
    for (const tool of trace.metrics.toolsUsed) {
      member.tools.set(tool, (member.tools.get(tool) ?? 0) + 1);
      teamTools.set(tool, (teamTools.get(tool) ?? 0) + 1);
    }

    // Count actual tool calls from timeline for more accurate numbers
    for (const event of trace.timeline) {
      if (event.type === "tool_call" || event.type === "tool_result") {
        const details = event.details as Record<string, unknown> | undefined;
        const toolName = details !== undefined ? (details["toolName"] as string | undefined) : undefined;
        if (toolName !== undefined && toolName.length > 0) {
          member.tools.set(toolName, (member.tools.get(toolName) ?? 0) + 1);
          teamTools.set(toolName, (teamTools.get(toolName) ?? 0) + 1);
        }
      }
    }

    // Repo usage
    const repo = trace.environment.gitRepo;
    if (repo !== undefined && repo.length > 0) {
      const repoEntry = member.repos.get(repo) ?? { sessions: 0, commits: 0 };
      repoEntry.sessions += 1;
      repoEntry.commits += trace.git.commits.length;
      member.repos.set(repo, repoEntry);
    }

    memberMap.set(userId, member);

    // Team-wide heatmap
    const heatKey = `${String(hour)}-${String(dayOfWeek)}`;
    heatmap.set(heatKey, (heatmap.get(heatKey) ?? 0) + 1);

    // Daily cost trend
    const dayEntry = dailyCost.get(dateStr) ?? { costUsd: 0, sessions: 0 };
    dayEntry.costUsd += trace.metrics.totalCostUsd;
    dayEntry.sessions += 1;
    dailyCost.set(dateStr, dayEntry);

    totalCost += trace.metrics.totalCostUsd;
    totalCommits += trace.git.commits.length;
    totalTokens += trace.metrics.totalInputTokens + trace.metrics.totalOutputTokens;
  }

  // Build member analytics
  const memberAnalytics: ApiTeamAnalyticsMember[] = [...memberMap.entries()]
    .map(([userId, m]) => {
      const models: ApiTeamAnalyticsModelUsage[] = [...m.models.entries()]
        .map(([model, data]) => ({ model, sessionCount: data.count, totalCostUsd: Number(data.costUsd.toFixed(6)) }))
        .sort((a, b) => b.totalCostUsd - a.totalCostUsd);

      const tools: ApiTeamAnalyticsToolUsage[] = [...m.tools.entries()]
        .map(([tool, callCount]) => ({ tool, callCount }))
        .sort((a, b) => b.callCount - a.callCount);

      const repos: ApiTeamAnalyticsRepoUsage[] = [...m.repos.entries()]
        .map(([repo, data]) => ({ repo, sessionCount: data.sessions, commitCount: data.commits }))
        .sort((a, b) => b.sessionCount - a.sessionCount);

      return {
        userId,
        displayName: m.displayName,
        totalCostUsd: Number(m.totalCostUsd.toFixed(6)),
        sessionCount: m.sessionCount,
        commitCount: m.commitCount,
        prCount: m.prCount,
        linesAdded: m.linesAdded,
        linesRemoved: m.linesRemoved,
        avgSessionCostUsd: m.sessionCount > 0 ? Number((m.totalCostUsd / m.sessionCount).toFixed(4)) : 0,
        costPerCommit: m.commitCount > 0 ? Number((m.totalCostUsd / m.commitCount).toFixed(2)) : 0,
        totalInputTokens: m.totalInputTokens,
        totalOutputTokens: m.totalOutputTokens,
        models,
        tools,
        repos,
        hourlyActivity: m.hourlyActivity,
        dailyActivity: m.dailyActivity
      };
    })
    .sort((a, b) => b.totalCostUsd - a.totalCostUsd);

  // Build top models
  const topModels: ApiTeamAnalyticsModelUsage[] = [...teamModels.entries()]
    .map(([model, data]) => ({ model, sessionCount: data.count, totalCostUsd: Number(data.costUsd.toFixed(6)) }))
    .sort((a, b) => b.totalCostUsd - a.totalCostUsd)
    .slice(0, 10);

  // Build top tools
  const topTools: ApiTeamAnalyticsToolUsage[] = [...teamTools.entries()]
    .map(([tool, callCount]) => ({ tool, callCount }))
    .sort((a, b) => b.callCount - a.callCount)
    .slice(0, 15);

  // Build heatmap
  const hourlyHeatmap: ApiTeamAnalyticsHeatmapCell[] = [];
  for (let day = 0; day < 7; day++) {
    for (let hour = 0; hour < 24; hour++) {
      const count = heatmap.get(`${String(hour)}-${String(day)}`) ?? 0;
      hourlyHeatmap.push({ hour, day, count });
    }
  }

  // Build cost trend with cumulative
  let cumulative = 0;
  const costTrend: ApiTeamAnalyticsCostTrendPoint[] = [...dailyCost.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, data]) => {
      cumulative += data.costUsd;
      return {
        date,
        costUsd: Number(data.costUsd.toFixed(6)),
        sessionCount: data.sessions,
        cumulativeCostUsd: Number(cumulative.toFixed(6))
      };
    });

  const totalSessions = traces.filter((t) => t.user.id !== "unknown_user").length;

  // Cost efficiency score: higher is better, based on commits per dollar
  const commitsPerDollar = totalCost > 0 ? totalCommits / totalCost : 0;
  const costEfficiencyScore = Math.min(100, Math.round(commitsPerDollar * 20));

  const payload: ApiTeamAnalyticsResponse = {
    status: "ok",
    period: { from, to },
    memberAnalytics,
    topModels,
    topTools,
    hourlyHeatmap,
    costTrend,
    avgCostPerSession: totalSessions > 0 ? Number((totalCost / totalSessions).toFixed(4)) : 0,
    avgCommitsPerSession: totalSessions > 0 ? Number((totalCommits / totalSessions).toFixed(2)) : 0,
    avgCostPerCommit: totalCommits > 0 ? Number((totalCost / totalCommits).toFixed(2)) : 0,
    totalTokensUsed: totalTokens,
    costEfficiencyScore
  };

  return { statusCode: 200, payload };
}
