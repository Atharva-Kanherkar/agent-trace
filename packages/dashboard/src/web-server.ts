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
    const method = req.method ?? "GET";

    if (method !== "GET") {
      sendJson(res, 405, {
        status: "error",
        message: "method not allowed"
      });
      return;
    }

    if (url === "/health") {
      const payload: DashboardHealthResponse = {
        status: "ok",
        service: "dashboard",
        uptimeSec: Math.floor((Date.now() - startedAtMs) / 1000)
      };
      sendJson(res, 200, payload);
      return;
    }

    if (url === "/api/sessions") {
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

    if (url === "/") {
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
