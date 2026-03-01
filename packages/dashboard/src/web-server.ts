import http from "node:http";

import { renderDashboardHtml } from "./web-render";
import type {
  DashboardHealthResponse,
  DashboardReplayTimelineEvent,
  DashboardSessionReplay,
  DashboardSessionReplayCommit,
  DashboardSessionReplayPullRequest,
  DashboardSessionReplayProvider,
  DashboardSessionReplayResponse,
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

function parsePathSegments(pathname: string): readonly string[] {
  return pathname.split("/").filter((segment) => segment.length > 0);
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
      totalCostUsd: typeof row["totalCostUsd"] === "number" ? row["totalCostUsd"] : 0,
      commitCount: typeof row["commitCount"] === "number" ? row["commitCount"] : 0,
      linesAdded: typeof row["linesAdded"] === "number" ? row["linesAdded"] : 0,
      linesRemoved: typeof row["linesRemoved"] === "number" ? row["linesRemoved"] : 0
    });
  });

  return sessions;
}

function parseTimelineEvent(entry: unknown): DashboardReplayTimelineEvent | undefined {
  if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
    return undefined;
  }
  const record = entry as Record<string, unknown>;
  const id = record["id"];
  const type = record["type"];
  const timestamp = record["timestamp"];
  if (typeof id !== "string" || typeof type !== "string" || typeof timestamp !== "string") {
    return undefined;
  }

  return {
    id,
    type,
    timestamp,
    ...(typeof record["promptId"] === "string" ? { promptId: record["promptId"] } : {}),
    ...(typeof record["status"] === "string" ? { status: record["status"] } : {}),
    ...(typeof record["costUsd"] === "number" ? { costUsd: record["costUsd"] } : {}),
    ...(typeof record["details"] === "object" && record["details"] !== null && !Array.isArray(record["details"])
      ? { details: record["details"] as Readonly<Record<string, unknown>> }
      : {})
  };
}

async function fetchSessionReplayFromApi(
  apiBaseUrl: string,
  sessionId: string
): Promise<DashboardSessionReplay | undefined> {
  const response = await fetch(`${apiBaseUrl}/v1/sessions/${encodeURIComponent(sessionId)}`);
  if (response.status === 404) {
    return undefined;
  }
  if (!response.ok) {
    throw new Error(`api returned status ${String(response.status)}`);
  }

  const payload = (await response.json()) as unknown;
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    throw new Error("api session payload is not an object");
  }
  const root = payload as Record<string, unknown>;
  const sessionRaw = root["session"];
  if (typeof sessionRaw !== "object" || sessionRaw === null || Array.isArray(sessionRaw)) {
    throw new Error("api session payload missing session");
  }
  const session = sessionRaw as Record<string, unknown>;
  const sessionIdValue = session["sessionId"];
  const startedAt = session["startedAt"];
  const metricsRaw = session["metrics"];
  const timelineRaw = session["timeline"];
  if (
    typeof sessionIdValue !== "string" ||
    typeof startedAt !== "string" ||
    typeof metricsRaw !== "object" ||
    metricsRaw === null ||
    Array.isArray(metricsRaw) ||
    !Array.isArray(timelineRaw)
  ) {
    throw new Error("api session payload format is invalid");
  }

  const metrics = metricsRaw as Record<string, unknown>;
  const timeline = timelineRaw.map((entry) => parseTimelineEvent(entry)).filter(
    (entry): entry is DashboardReplayTimelineEvent => entry !== undefined
  );

  const envRaw = session["environment"];
  const envRecord =
    typeof envRaw === "object" && envRaw !== null && !Array.isArray(envRaw)
      ? (envRaw as Record<string, unknown>)
      : undefined;
  const gitBranch = envRecord !== undefined && typeof envRecord["gitBranch"] === "string" ? envRecord["gitBranch"] : undefined;

  const gitRaw = session["git"];
  const gitRecord =
    typeof gitRaw === "object" && gitRaw !== null && !Array.isArray(gitRaw)
      ? (gitRaw as Record<string, unknown>)
      : undefined;

  const commits: DashboardSessionReplayCommit[] = [];
  if (gitRecord !== undefined && Array.isArray(gitRecord["commits"])) {
    for (const entry of gitRecord["commits"]) {
      if (typeof entry !== "object" || entry === null || Array.isArray(entry)) continue;
      const c = entry as Record<string, unknown>;
      if (typeof c["sha"] !== "string") continue;
      commits.push({
        sha: c["sha"],
        ...(typeof c["message"] === "string" ? { message: c["message"] } : {}),
        ...(typeof c["promptId"] === "string" ? { promptId: c["promptId"] } : {}),
        ...(typeof c["committedAt"] === "string" ? { committedAt: c["committedAt"] } : {})
      });
    }
  }

  const pullRequests: DashboardSessionReplayPullRequest[] = [];
  if (gitRecord !== undefined && Array.isArray(gitRecord["pullRequests"])) {
    for (const entry of gitRecord["pullRequests"]) {
      if (typeof entry !== "object" || entry === null || Array.isArray(entry)) continue;
      const pr = entry as Record<string, unknown>;
      if (typeof pr["repo"] !== "string" || typeof pr["prNumber"] !== "number") continue;
      pullRequests.push({
        repo: pr["repo"],
        prNumber: pr["prNumber"],
        state: typeof pr["state"] === "string" ? pr["state"] : "open",
        ...(typeof pr["url"] === "string" ? { url: pr["url"] } : {})
      });
    }
  }

  const modelsUsed: string[] = [];
  if (Array.isArray(metrics["modelsUsed"])) {
    for (const item of metrics["modelsUsed"]) {
      if (typeof item === "string" && item.length > 0) modelsUsed.push(item);
    }
  }
  const toolsUsed: string[] = [];
  if (Array.isArray(metrics["toolsUsed"])) {
    for (const item of metrics["toolsUsed"]) {
      if (typeof item === "string" && item.length > 0) toolsUsed.push(item);
    }
  }
  const filesTouched: string[] = [];
  if (Array.isArray(metrics["filesTouched"])) {
    for (const item of metrics["filesTouched"]) {
      if (typeof item === "string" && item.length > 0) filesTouched.push(item);
    }
  }

  return {
    sessionId: sessionIdValue,
    startedAt,
    ...(typeof session["endedAt"] === "string" ? { endedAt: session["endedAt"] } : {}),
    metrics: {
      promptCount: typeof metrics["promptCount"] === "number" ? metrics["promptCount"] : 0,
      toolCallCount: typeof metrics["toolCallCount"] === "number" ? metrics["toolCallCount"] : 0,
      totalCostUsd: typeof metrics["totalCostUsd"] === "number" ? metrics["totalCostUsd"] : 0,
      totalInputTokens: typeof metrics["totalInputTokens"] === "number" ? metrics["totalInputTokens"] : 0,
      totalOutputTokens: typeof metrics["totalOutputTokens"] === "number" ? metrics["totalOutputTokens"] : 0,
      totalCacheReadTokens: typeof metrics["totalCacheReadTokens"] === "number" ? metrics["totalCacheReadTokens"] : 0,
      totalCacheWriteTokens: typeof metrics["totalCacheWriteTokens"] === "number" ? metrics["totalCacheWriteTokens"] : 0,
      linesAdded: typeof metrics["linesAdded"] === "number" ? metrics["linesAdded"] : 0,
      linesRemoved: typeof metrics["linesRemoved"] === "number" ? metrics["linesRemoved"] : 0,
      modelsUsed,
      toolsUsed,
      filesTouched
    },
    ...(gitBranch !== undefined ? { environment: { gitBranch } } : {}),
    ...(commits.length > 0 || pullRequests.length > 0
      ? { git: { commits, pullRequests } }
      : {}),
    timeline
  };
}

function createDefaultSessionsProvider(apiBaseUrl: string): DashboardSessionsProvider {
  return {
    fetchSessions: async (): Promise<readonly DashboardSessionSummary[]> => fetchSessionsFromApi(apiBaseUrl)
  };
}

function createDefaultSessionReplayProvider(apiBaseUrl: string): DashboardSessionReplayProvider {
  return {
    fetchSession: async (sessionId: string): Promise<DashboardSessionReplay | undefined> =>
      fetchSessionReplayFromApi(apiBaseUrl, sessionId)
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
  const sessionReplayProvider =
    options.sessionReplayProvider ?? createDefaultSessionReplayProvider(apiBaseUrl);

  const server = http.createServer((req, res) => {
    const url = req.url ?? "/";
    const pathname = parsePathname(url);
    const segments = parsePathSegments(pathname);
    const method = req.method ?? "GET";

    // Allow POST for team budget
    if (method === "POST" && pathname === "/api/team/budget") {
      let body = "";
      req.setEncoding("utf8");
      req.on("data", (chunk: string) => { body += chunk; });
      req.on("end", () => {
        let parsedBody: unknown;
        try {
          parsedBody = body.length > 0 ? JSON.parse(body) : {};
        } catch {
          sendJson(res, 400, { status: "error", message: "invalid JSON body" });
          return;
        }
        const authHeader = req.headers["authorization"];
        const headers: Record<string, string> = { "Content-Type": "application/json" };
        if (typeof authHeader === "string") {
          headers["Authorization"] = authHeader;
        }
        void fetch(`${apiBaseUrl}/v1/team/budget`, {
          method: "POST",
          headers,
          body: JSON.stringify(parsedBody)
        }).then(async (apiResponse) => {
          const payload = await apiResponse.json();
          sendJson(res, apiResponse.status, payload);
        }).catch((error: unknown) => {
          sendJson(res, 502, { status: "error", message: `proxy error: ${String(error)}` });
        });
      });
      return;
    }

    // Allow POST for team insights context
    if (method === "POST" && pathname === "/api/team/insights/context") {
      let body = "";
      req.setEncoding("utf8");
      req.on("data", (chunk: string) => { body += chunk; });
      req.on("end", () => {
        let parsedBody: unknown;
        try {
          parsedBody = body.length > 0 ? JSON.parse(body) : {};
        } catch {
          sendJson(res, 400, { status: "error", message: "invalid JSON body" });
          return;
        }
        const authHeader = req.headers["authorization"];
        const headers: Record<string, string> = { "Content-Type": "application/json" };
        if (typeof authHeader === "string") {
          headers["Authorization"] = authHeader;
        }
        void fetch(`${apiBaseUrl}/v1/team/insights/context`, {
          method: "POST",
          headers,
          body: JSON.stringify(parsedBody)
        }).then(async (apiResponse) => {
          const payload = await apiResponse.json();
          sendJson(res, apiResponse.status, payload);
        }).catch((error: unknown) => {
          sendJson(res, 502, { status: "error", message: `proxy error: ${String(error)}` });
        });
      });
      return;
    }

    // Allow POST for team insights generate
    if (method === "POST" && pathname === "/api/team/insights/generate") {
      let body = "";
      req.setEncoding("utf8");
      req.on("data", (chunk: string) => { body += chunk; });
      req.on("end", () => {
        const parsedUrl = new URL(url, "http://localhost");
        const queryString = parsedUrl.search;
        const authHeader = req.headers["authorization"];
        const headers: Record<string, string> = { "Content-Type": "application/json" };
        if (typeof authHeader === "string") {
          headers["Authorization"] = authHeader;
        }
        void fetch(`${apiBaseUrl}/v1/team/insights/generate${queryString}`, {
          method: "POST",
          headers,
          body: body.length > 0 ? body : "{}"
        }).then(async (apiResponse) => {
          const payload = await apiResponse.json();
          sendJson(res, apiResponse.status, payload);
        }).catch((error: unknown) => {
          sendJson(res, 502, { status: "error", message: `proxy error: ${String(error)}` });
        });
      });
      return;
    }

    // Allow POST for insights endpoints
    if (method === "POST" && (pathname === "/api/settings/insights" || (segments.length === 4 && segments[0] === "api" && segments[1] === "session" && segments[3] === "insights"))) {
      let body = "";
      req.setEncoding("utf8");
      req.on("data", (chunk: string) => { body += chunk; });
      req.on("end", () => {
        let parsedBody: unknown;
        try {
          parsedBody = body.length > 0 ? JSON.parse(body) : {};
        } catch {
          sendJson(res, 400, { status: "error", message: "invalid JSON body" });
          return;
        }

        let apiPath: string;
        if (pathname === "/api/settings/insights") {
          apiPath = "/v1/settings/insights";
        } else {
          const sessionId = segments[2];
          apiPath = `/v1/sessions/${encodeURIComponent(sessionId ?? "")}/insights`;
        }

        void fetch(`${apiBaseUrl}${apiPath}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(parsedBody)
        }).then(async (apiResponse) => {
          const payload = await apiResponse.json();
          sendJson(res, apiResponse.status, payload);
        }).catch((error: unknown) => {
          sendJson(res, 502, { status: "error", message: `proxy error: ${String(error)}` });
        });
      });
      return;
    }

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

    if (pathname === "/api/analytics/cost/daily") {
      void fetch(`${apiBaseUrl}/v1/analytics/cost/daily`)
        .then(async (apiResponse) => {
          if (!apiResponse.ok) {
            sendJson(res, 502, { status: "error", message: `api returned status ${String(apiResponse.status)}` });
            return;
          }
          const payload = await apiResponse.json();
          sendJson(res, 200, payload);
        })
        .catch((error: unknown) => {
          sendJson(res, 502, { status: "error", message: `failed to fetch daily cost: ${String(error)}` });
        });
      return;
    }

    // Auth check proxy
    if (pathname === "/api/auth/check") {
      const authHeader = req.headers["authorization"];
      const headers: Record<string, string> = {};
      if (typeof authHeader === "string") {
        headers["Authorization"] = authHeader;
      }
      void fetch(`${apiBaseUrl}/v1/auth/check`, { headers })
        .then(async (apiResponse) => {
          const payload = await apiResponse.json();
          sendJson(res, apiResponse.status, payload);
        })
        .catch((error: unknown) => {
          sendJson(res, 502, { status: "error", message: `proxy error: ${String(error)}` });
        });
      return;
    }

    // Team API proxies
    if (pathname.startsWith("/api/team/")) {
      const authHeader = req.headers["authorization"];
      const headers: Record<string, string> = {};
      if (typeof authHeader === "string") {
        headers["Authorization"] = authHeader;
      }
      const parsedUrl = new URL(url, "http://localhost");
      const queryString = parsedUrl.search;
      const teamPath = pathname.replace("/api/team/", "/v1/team/");

      if (pathname === "/api/team/stream") {
        // SSE bridge for team data
        res.statusCode = 200;
        res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Connection", "keep-alive");
        res.setHeader("X-Accel-Buffering", "no");
        res.flushHeaders();

        let closed = false;
        let writing = false;
        const writeTeamSnapshot = async (): Promise<void> => {
          if (closed || writing) return;
          writing = true;
          try {
            const [overviewRes, membersRes, costRes, budgetRes] = await Promise.all([
              fetch(`${apiBaseUrl}/v1/team/overview${queryString}`, { headers }),
              fetch(`${apiBaseUrl}/v1/team/members${queryString}`, { headers }),
              fetch(`${apiBaseUrl}/v1/team/cost/daily${queryString}`, { headers }),
              fetch(`${apiBaseUrl}/v1/team/budget`, { headers })
            ]);
            const overview = await overviewRes.json();
            const members = await membersRes.json();
            const cost = await costRes.json();
            const budget = await budgetRes.json();
            const payload = JSON.stringify({ overview, members, cost, budget, emittedAt: new Date().toISOString() });
            res.write("event: team\n");
            res.write(`data: ${payload}\n\n`);
          } catch (error: unknown) {
            res.write("event: bridge_error\n");
            res.write(`data: ${JSON.stringify({ message: String(error) })}\n\n`);
          } finally {
            writing = false;
          }
        };

        void writeTeamSnapshot();
        const interval = setInterval(() => { void writeTeamSnapshot(); }, 2000);
        const cleanup = (): void => {
          if (closed) return;
          closed = true;
          clearInterval(interval);
          if (!res.writableEnded) res.end();
        };
        req.on("close", cleanup);
        res.on("close", cleanup);
        return;
      }

      // Regular team API proxy (GET)
      void fetch(`${apiBaseUrl}${teamPath}${queryString}`, { headers })
        .then(async (apiResponse) => {
          const payload = await apiResponse.json();
          sendJson(res, apiResponse.status, payload);
        })
        .catch((error: unknown) => {
          sendJson(res, 502, { status: "error", message: `proxy error: ${String(error)}` });
        });
      return;
    }

    if (segments.length === 3 && segments[0] === "api" && segments[1] === "session") {
      const encodedSessionId = segments[2];
      let sessionId = "";
      if (encodedSessionId !== undefined) {
        try {
          sessionId = decodeURIComponent(encodedSessionId);
        } catch {
          sendJson(res, 400, {
            status: "error",
            message: "session id is invalid"
          });
          return;
        }
      }
      if (sessionId.length === 0) {
        sendJson(res, 400, {
          status: "error",
          message: "session id is required"
        });
        return;
      }

      void sessionReplayProvider
        .fetchSession(sessionId)
        .then((session) => {
          if (session === undefined) {
            sendJson(res, 404, {
              status: "error",
              message: "session not found"
            });
            return;
          }

          const payload: DashboardSessionReplayResponse = {
            status: "ok",
            session
          };
          sendJson(res, 200, payload);
        })
        .catch((error: unknown) => {
          sendJson(res, 502, {
            status: "error",
            message: `failed to fetch session replay: ${String(error)}`
          });
        });
      return;
    }

    if (pathname === "/api/settings/insights") {
      void fetch(`${apiBaseUrl}/v1/settings/insights`)
        .then(async (apiResponse) => {
          const payload = await apiResponse.json();
          sendJson(res, apiResponse.status, payload);
        })
        .catch((error: unknown) => {
          sendJson(res, 502, { status: "error", message: `proxy error: ${String(error)}` });
        });
      return;
    }

    if (pathname === "/") {
      sendHtml(res, 200, renderDashboardHtml(options.currentUserEmail !== undefined ? { currentUserEmail: options.currentUserEmail } : {}));
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
