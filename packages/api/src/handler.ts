import { handleGetInsightsSettings, handlePostInsightsSettings, handlePostSessionInsight } from "./insights-handler";
import { toSessionSummary } from "./mapper";
import type {
  ApiCostDailyResponse,
  ApiErrorResponse,
  ApiHandlerDependencies,
  ApiHealthResponse,
  ApiRequest,
  ApiResponse,
  ApiSessionDetailResponse,
  ApiSessionListResponse,
  ApiSessionTimelineResponse,
  SessionFilters
} from "./types";

function buildError(message: string): ApiErrorResponse {
  return {
    status: "error",
    message
  };
}

function buildHealth(startedAtMs: number): ApiHealthResponse {
  return {
    status: "ok",
    service: "api",
    uptimeSec: Math.floor((Date.now() - startedAtMs) / 1000)
  };
}

function parseFilters(searchParams: URLSearchParams): SessionFilters {
  const userId = searchParams.get("userId");
  const repo = searchParams.get("repo");
  return {
    ...(userId !== null ? { userId } : {}),
    ...(repo !== null ? { repo } : {})
  };
}

function parseSessionPath(pathname: string): readonly string[] {
  return pathname.split("/").filter((segment) => segment.length > 0);
}

function toMetricDate(startedAt: string): string {
  const parsed = Date.parse(startedAt);
  if (Number.isNaN(parsed)) {
    return startedAt.slice(0, 10);
  }
  return new Date(parsed).toISOString().slice(0, 10);
}

function buildDailyCostResponseFromTraces(
  dependencies: ApiHandlerDependencies,
  filters: SessionFilters
): ApiCostDailyResponse {
  const traces = dependencies.repository.list(filters);
  const byDate = new Map<
    string,
    {
      totalCostUsd: number;
      sessionCount: number;
      promptCount: number;
      toolCallCount: number;
    }
  >();

  traces.forEach((trace) => {
    const date = toMetricDate(trace.startedAt);
    const current = byDate.get(date) ?? {
      totalCostUsd: 0,
      sessionCount: 0,
      promptCount: 0,
      toolCallCount: 0
    };
    current.totalCostUsd += trace.metrics.totalCostUsd;
    current.sessionCount += 1;
    current.promptCount += trace.metrics.promptCount;
    current.toolCallCount += trace.metrics.toolCallCount;
    byDate.set(date, current);
  });

  const points = [...byDate.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([date, entry]) => ({
      date,
      totalCostUsd: Number(entry.totalCostUsd.toFixed(6)),
      sessionCount: entry.sessionCount,
      promptCount: entry.promptCount,
      toolCallCount: entry.toolCallCount
    }));

  return {
    status: "ok",
    points
  };
}

async function buildDailyCostResponse(
  dependencies: ApiHandlerDependencies,
  filters: SessionFilters
): Promise<ApiCostDailyResponse> {
  if (dependencies.dailyCostReader !== undefined) {
    try {
      const points = await dependencies.dailyCostReader.listDailyCosts(30);
      return { status: "ok", points };
    } catch {
      // fall back to in-memory aggregation
    }
  }
  return buildDailyCostResponseFromTraces(dependencies, filters);
}

export async function handleApiRequest(request: ApiRequest, dependencies: ApiHandlerDependencies): Promise<ApiResponse> {
  const parsedUrl = new URL(request.url, "http://localhost");
  const pathname = parsedUrl.pathname;

  if (request.method === "GET" && pathname === "/health") {
    return {
      statusCode: 200,
      payload: buildHealth(dependencies.startedAtMs)
    };
  }

  if (request.method === "GET" && pathname === "/v1/sessions") {
    const filters = parseFilters(parsedUrl.searchParams);
    const sessions = dependencies.repository.list(filters).map(toSessionSummary);
    const payload: ApiSessionListResponse = {
      status: "ok",
      count: sessions.length,
      sessions
    };

    return {
      statusCode: 200,
      payload
    };
  }

  if (request.method === "GET" && pathname === "/v1/analytics/cost/daily") {
    const filters = parseFilters(parsedUrl.searchParams);
    return {
      statusCode: 200,
      payload: await buildDailyCostResponse(dependencies, filters)
    };
  }

  if (request.method === "GET" && pathname === "/v1/settings/insights") {
    return handleGetInsightsSettings(dependencies);
  }

  if (request.method === "POST" && pathname === "/v1/settings/insights") {
    return handlePostInsightsSettings(request.body, dependencies);
  }

  const insightsMatch = pathname.match(/^\/v1\/sessions\/([^/]+)\/insights$/);
  if (request.method === "POST" && insightsMatch !== null && insightsMatch[1] !== undefined) {
    return handlePostSessionInsight(decodeURIComponent(insightsMatch[1]), dependencies);
  }

  if (request.method === "GET") {
    const segments = parseSessionPath(pathname);
    if (segments.length >= 3 && segments[0] === "v1" && segments[1] === "sessions") {
      const sessionId = segments[2];
      if (sessionId === undefined) {
        return {
          statusCode: 404,
          payload: buildError("not found")
        };
      }
      const trace = dependencies.repository.getBySessionId(sessionId);

      if (trace === undefined) {
        return {
          statusCode: 404,
          payload: buildError("session not found")
        };
      }

      if (segments.length === 3) {
        const payload: ApiSessionDetailResponse = {
          status: "ok",
          session: trace
        };
        return {
          statusCode: 200,
          payload
        };
      }

      if (segments.length === 4 && segments[3] === "timeline") {
        const payload: ApiSessionTimelineResponse = {
          status: "ok",
          timeline: trace.timeline
        };
        return {
          statusCode: 200,
          payload
        };
      }
    }
  }

  return {
    statusCode: 404,
    payload: buildError("not found")
  };
}
