import http from "node:http";

import { renderDashboardHtml } from "./web-render";
import type {
  DashboardHealthResponse,
  DashboardServerHandle,
  DashboardServerSessionsResponse,
  DashboardServerStartOptions,
  DashboardSessionSummary,
  DashboardSessionsProvider
} from "./web-types";

function parsePathname(url: string): string {
  try {
    return new URL(url, "http://localhost").pathname;
  } catch {
    return url;
  }
}

function toAddress(server: http.Server): string {
  const address = server.address();
  if (address === null) {
    return "unknown";
  }
  if (typeof address === "string") {
    return address;
  }
  return `${address.address}:${String(address.port)}`;
}

async function listen(server: http.Server, port: number, host: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.listen(port, host, () => resolve());
    server.once("error", (error) => reject(error));
  });
}

async function close(server: http.Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error !== undefined && error !== null) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

async function fetchSessionsFromApi(apiBaseUrl: string): Promise<readonly DashboardSessionSummary[]> {
  const response = await fetch(`${apiBaseUrl}/v1/sessions`);
  if (!response.ok) {
    throw new Error(`api returned status ${String(response.status)}`);
  }

  const payload = (await response.json()) as unknown;
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    throw new Error("api payload is not an object");
  }
  const record = payload as Record<string, unknown>;
  const sessionsRaw = record["sessions"];
  if (!Array.isArray(sessionsRaw)) {
    throw new Error("api payload sessions is not an array");
  }

  const sessions: DashboardSessionSummary[] = [];
  sessionsRaw.forEach((entry) => {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
      return;
    }

    const row = entry as Record<string, unknown>;
    const sessionId = row["sessionId"];
    const userId = row["userId"];
    const startedAt = row["startedAt"];
    if (typeof sessionId !== "string" || typeof userId !== "string" || typeof startedAt !== "string") {
      return;
    }

    sessions.push({
      sessionId,
      userId,
      gitRepo: typeof row["gitRepo"] === "string" ? row["gitRepo"] : null,
      gitBranch: typeof row["gitBranch"] === "string" ? row["gitBranch"] : null,
      startedAt,
      endedAt: typeof row["endedAt"] === "string" ? row["endedAt"] : null,
      promptCount: typeof row["promptCount"] === "number" ? row["promptCount"] : 0,
      toolCallCount: typeof row["toolCallCount"] === "number" ? row["toolCallCount"] : 0,
      totalCostUsd: typeof row["totalCostUsd"] === "number" ? row["totalCostUsd"] : 0
    });
  });

  return sessions;
}

function createDefaultSessionsProvider(apiBaseUrl: string): DashboardSessionsProvider {
  return {
    fetchSessions: async (): Promise<readonly DashboardSessionSummary[]> => fetchSessionsFromApi(apiBaseUrl)
  };
}

function sendJson(res: http.ServerResponse, statusCode: number, payload: unknown): void {
  const body = JSON.stringify(payload);
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(body);
}

function sendHtml(res: http.ServerResponse, statusCode: number, html: string): void {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.end(html);
}

async function writeSessionsSnapshot(
  res: http.ServerResponse,
  sessionsProvider: DashboardSessionsProvider
): Promise<void> {
  const sessions = await sessionsProvider.fetchSessions();
  const payload: DashboardServerSessionsResponse = {
    status: "ok",
    count: sessions.length,
    sessions
  };

  res.write("event: sessions\n");
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function startSessionsSseBridge(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  sessionsProvider: DashboardSessionsProvider
): void {
  res.statusCode = 200;
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  let closed = false;
  let writing = false;
  const writeSnapshot = async (): Promise<void> => {
    if (closed || writing) {
      return;
    }
    writing = true;
    try {
      await writeSessionsSnapshot(res, sessionsProvider);
    } catch (error: unknown) {
      res.write("event: bridge_error\n");
      res.write(`data: ${JSON.stringify({ message: String(error) })}\n\n`);
    } finally {
      writing = false;
    }
  };

  void writeSnapshot();
  const interval = setInterval(() => {
    void writeSnapshot();
  }, 2000);

  const cleanup = (): void => {
    if (closed) {
      return;
    }
    closed = true;
    clearInterval(interval);
    if (!res.writableEnded) {
      res.end();
    }
  };

  req.on("close", cleanup);
  res.on("close", cleanup);
}

export async function startDashboardServer(
  options: DashboardServerStartOptions = {}
): Promise<DashboardServerHandle> {
  const host = options.host ?? "127.0.0.1";
  const port = options.port ?? 3100;
  const startedAtMs = options.startedAtMs ?? Date.now();
  const apiBaseUrl = options.apiBaseUrl ?? "http://127.0.0.1:8318";
  const sessionsProvider = options.sessionsProvider ?? createDefaultSessionsProvider(apiBaseUrl);

  const server = http.createServer((req, res) => {
    const url = req.url ?? "/";
    const pathname = parsePathname(url);
    const method = req.method ?? "GET";

    if (method !== "GET") {
      sendJson(res, 405, {
        status: "error",
        message: "method not allowed"
      });
      return;
    }

    if (pathname === "/health") {
      const payload: DashboardHealthResponse = {
        status: "ok",
        service: "dashboard",
        uptimeSec: Math.floor((Date.now() - startedAtMs) / 1000)
      };
      sendJson(res, 200, payload);
      return;
    }

    if (pathname === "/api/sessions") {
      void sessionsProvider
        .fetchSessions()
        .then((sessions) => {
          const payload: DashboardServerSessionsResponse = {
            status: "ok",
            count: sessions.length,
            sessions
          };
          sendJson(res, 200, payload);
        })
        .catch((error: unknown) => {
          sendJson(res, 502, {
            status: "error",
            message: `failed to fetch sessions: ${String(error)}`
          });
        });
      return;
    }

    if (pathname === "/api/sessions/stream") {
      startSessionsSseBridge(req, res, sessionsProvider);
      return;
    }

    if (pathname === "/") {
      sendHtml(res, 200, renderDashboardHtml());
      return;
    }

    sendJson(res, 404, {
      status: "error",
      message: "not found"
    });
  });

  await listen(server, port, host);

  return {
    address: toAddress(server),
    apiBaseUrl,
    close: async (): Promise<void> => {
      await close(server);
    }
  };
}
