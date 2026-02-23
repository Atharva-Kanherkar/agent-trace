import { toSessionSummary } from "./mapper";
import type {
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

export function handleApiRequest(request: ApiRequest, dependencies: ApiHandlerDependencies): ApiResponse {
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
