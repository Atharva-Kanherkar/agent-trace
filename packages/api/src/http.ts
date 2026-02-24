import http from "node:http";

import { handleApiRequest } from "./handler";
import { toSessionSummary } from "./mapper";
import type { ApiHandlerDependencies, ApiMethod, ApiRawHttpRequest, ApiResponse } from "./types";

function normalizeMethod(method: string): ApiMethod | undefined {
  if (method === "GET") {
    return method;
  }
  return undefined;
}

function sendJson(res: http.ServerResponse, statusCode: number, payload: unknown): void {
  const body = JSON.stringify(payload);
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(body);
}

function parsePathname(url: string): string {
  try {
    const parsed = new URL(url, "http://localhost");
    return parsed.pathname;
  } catch {
    return url;
  }
}

function isSseSessionsRoute(method: string, url: string): boolean {
  return method === "GET" && parsePathname(url) === "/v1/sessions/stream";
}

function startSessionsSseStream(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  dependencies: ApiHandlerDependencies
): void {
  res.statusCode = 200;
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  const writeSnapshot = (): void => {
    const sessions = dependencies.repository.list({}).map(toSessionSummary);
    const payload = JSON.stringify({
      status: "ok",
      count: sessions.length,
      sessions,
      emittedAt: new Date().toISOString()
    });

    res.write(`event: sessions\n`);
    res.write(`data: ${payload}\n\n`);
  };

  writeSnapshot();
  const interval = setInterval(writeSnapshot, 2000);

  const cleanup = (): void => {
    clearInterval(interval);
    if (!res.writableEnded) {
      res.end();
    }
  };

  req.on("close", cleanup);
}

export async function handleApiRawHttpRequest(
  request: ApiRawHttpRequest,
  dependencies: ApiHandlerDependencies
): Promise<ApiResponse> {
  const method = normalizeMethod(request.method);
  if (method === undefined) {
    return {
      statusCode: 405,
      payload: {
        status: "error",
        message: "method not allowed"
      }
    };
  }

  return handleApiRequest(
    {
      method,
      url: request.url
    },
    dependencies
  );
}

export function createApiHttpHandler(
  dependencies: ApiHandlerDependencies
): (req: http.IncomingMessage, res: http.ServerResponse) => void {
  return (req: http.IncomingMessage, res: http.ServerResponse): void => {
    const method = req.method ?? "GET";
    const url = req.url ?? "/";
    if (isSseSessionsRoute(method, url)) {
      startSessionsSseStream(req, res, dependencies);
      return;
    }

    void handleApiRawHttpRequest(
      {
        method,
        url
      },
      dependencies
    ).then((response) => {
      sendJson(res, response.statusCode, response.payload);
    }).catch(() => {
      sendJson(res, 500, { status: "error", message: "internal server error" });
    });
  };
}
