import http from "node:http";

import { handleApiRequest } from "./handler";
import { toSessionSummary } from "./mapper";
import type { ApiHandlerDependencies, ApiMethod, ApiRawHttpRequest, ApiResponse } from "./types";

function normalizeMethod(method: string): ApiMethod | undefined {
  if (method === "GET" || method === "POST") {
    return method;
  }
  return undefined;
}

function checkApiAuth(authorizationHeader: string | undefined): boolean {
  const teamAuthToken = process.env["TEAM_AUTH_TOKEN"];
  if (teamAuthToken === undefined || teamAuthToken.length === 0) {
    return true; // No auth required
  }
  if (authorizationHeader === undefined || authorizationHeader.length === 0) {
    return false;
  }
  return authorizationHeader === `Bearer ${teamAuthToken}`;
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
  request: ApiRawHttpRequest & { readonly body?: unknown },
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
      url: request.url,
      ...(request.body !== undefined ? { body: request.body } : {})
    },
    dependencies
  );
}

function readRequestBody(req: http.IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => { data += chunk; });
    req.on("end", () => {
      if (data.length === 0) {
        resolve(undefined);
        return;
      }
      try {
        resolve(JSON.parse(data));
      } catch {
        reject(new Error("invalid JSON body"));
      }
    });
    req.on("error", (error) => reject(error));
  });
}

export function createApiHttpHandler(
  dependencies: ApiHandlerDependencies
): (req: http.IncomingMessage, res: http.ServerResponse) => void {
  return (req: http.IncomingMessage, res: http.ServerResponse): void => {
    const method = req.method ?? "GET";
    const url = req.url ?? "/";
    const authHeader = typeof req.headers["authorization"] === "string" ? req.headers["authorization"] : undefined;

    // Auth check endpoint — always accessible
    if (method === "GET" && parsePathname(url) === "/v1/auth/check") {
      const teamAuthToken = process.env["TEAM_AUTH_TOKEN"];
      const authRequired = teamAuthToken !== undefined && teamAuthToken.length > 0;
      const authValid = !authRequired || checkApiAuth(authHeader);
      sendJson(res, 200, { status: "ok", authRequired, authValid });
      return;
    }

    // Enforce auth on all other endpoints when TEAM_AUTH_TOKEN is set
    if (!checkApiAuth(authHeader)) {
      sendJson(res, 401, { status: "error", message: "authorization required" });
      return;
    }

    if (isSseSessionsRoute(method, url)) {
      startSessionsSseStream(req, res, dependencies);
      return;
    }

    const dispatch = (body?: unknown): void => {
      void handleApiRawHttpRequest(
        {
          method,
          url,
          ...(body !== undefined ? { body } : {})
        },
        dependencies
      ).then((response) => {
        sendJson(res, response.statusCode, response.payload);
      }).catch(() => {
        sendJson(res, 500, { status: "error", message: "internal server error" });
      });
    };

    if (method === "POST") {
      readRequestBody(req).then((body) => {
        dispatch(body);
      }).catch(() => {
        sendJson(res, 400, { status: "error", message: "invalid request body" });
      });
      return;
    }

    dispatch();
  };
}
