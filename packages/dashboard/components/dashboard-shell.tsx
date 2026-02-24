"use client";

import { useEffect, useMemo, useState } from "react";
import type { ReactElement } from "react";

import type {
  UiCostDailyPoint,
  UiSessionCommit,
  UiSessionReplay,
  UiSessionSummary
} from "../src/next-types";

interface DashboardShellProps {
  readonly initialSessions: readonly UiSessionSummary[];
  readonly initialCostPoints: readonly UiCostDailyPoint[];
  readonly initialWarning?: string;
}

type StreamStatus = "connecting" | "live" | "polling" | "error";

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
    totalCostUsd: readNumber(record, "totalCostUsd") ?? 0
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

function parseReplay(value: unknown): UiSessionReplay | undefined {
  const record = asRecord(value);
  if (record === undefined) {
    return undefined;
  }

  const sessionId = readString(record, "sessionId");
  const startedAt = readString(record, "startedAt");
  const metrics = asRecord(record["metrics"]);
  const timelineRaw = record["timeline"];
  if (sessionId === undefined || startedAt === undefined || metrics === undefined || !Array.isArray(timelineRaw)) {
    return undefined;
  }

  const endedAt = readString(record, "endedAt");
  const gitRecord = asRecord(record["git"]);
  const commitsRaw = gitRecord !== undefined && Array.isArray(gitRecord["commits"]) ? gitRecord["commits"] : [];
  const commits: UiSessionCommit[] = commitsRaw
    .map((entry) => {
      const c = asRecord(entry);
      if (c === undefined) {
        return undefined;
      }
      const sha = readString(c, "sha");
      if (sha === undefined) {
        return undefined;
      }
      return {
        sha,
        ...(readString(c, "message") !== undefined ? { message: readString(c, "message") } : {}),
        ...(readString(c, "promptId") !== undefined ? { promptId: readString(c, "promptId") } : {}),
        ...(readString(c, "committedAt") !== undefined ? { committedAt: readString(c, "committedAt") } : {})
      };
    })
    .filter((entry): entry is UiSessionCommit => entry !== undefined);

  return {
    sessionId,
    startedAt,
    ...(endedAt !== undefined ? { endedAt } : {}),
    metrics: {
      promptCount: readNumber(metrics, "promptCount") ?? 0,
      toolCallCount: readNumber(metrics, "toolCallCount") ?? 0,
      totalCostUsd: readNumber(metrics, "totalCostUsd") ?? 0,
      totalInputTokens: readNumber(metrics, "totalInputTokens") ?? 0,
      totalOutputTokens: readNumber(metrics, "totalOutputTokens") ?? 0,
      linesAdded: readNumber(metrics, "linesAdded") ?? 0,
      linesRemoved: readNumber(metrics, "linesRemoved") ?? 0,
      modelsUsed: readStringArray(metrics, "modelsUsed"),
      toolsUsed: readStringArray(metrics, "toolsUsed"),
      filesTouched: readStringArray(metrics, "filesTouched")
    },
    commits,
    timeline: timelineRaw
      .map((entry) => {
        const event = asRecord(entry);
        if (event === undefined) {
          return undefined;
        }
        const id = readString(event, "id");
        const type = readString(event, "type");
        const timestamp = readString(event, "timestamp");
        if (id === undefined || type === undefined || timestamp === undefined) {
          return undefined;
        }
        const details = asRecord(event["details"]);
        const toolName = details === undefined ? undefined : readString(details, "toolName");
        const toolDurationMs = details === undefined ? undefined : readNumber(details, "toolDurationMs");
        const detail =
          details === undefined ? undefined : readString(details, "promptText") ?? readString(details, "command");
        const tokens = asRecord(event["tokens"]);
        const inputTokens = tokens === undefined ? undefined : readNumber(tokens, "input");
        const outputTokens = tokens === undefined ? undefined : readNumber(tokens, "output");
        return {
          id,
          type,
          timestamp,
          ...(readString(event, "promptId") !== undefined ? { promptId: readString(event, "promptId") } : {}),
          ...(readString(event, "status") !== undefined ? { status: readString(event, "status") } : {}),
          ...(readNumber(event, "costUsd") !== undefined ? { costUsd: readNumber(event, "costUsd") } : {}),
          ...(toolName !== undefined ? { toolName } : {}),
          ...(toolDurationMs !== undefined ? { toolDurationMs } : {}),
          ...(inputTokens !== undefined ? { inputTokens } : {}),
          ...(outputTokens !== undefined ? { outputTokens } : {}),
          ...(detail !== undefined ? { detail } : {})
        };
      })
      .filter((entry): entry is UiSessionReplay["timeline"][number] => entry !== undefined)
  };
}

function formatMoney(value: number): string {
  return `$${value.toFixed(2)}`;
}

function formatDate(value: string): string {
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    return value;
  }
  return new Date(parsed).toLocaleString();
}

function shortenText(value: string, maxLength = 80): string {
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, maxLength - 1)}...`;
}

export function DashboardShell(props: DashboardShellProps): ReactElement {
  const [sessions, setSessions] = useState<readonly UiSessionSummary[]>(props.initialSessions);
  const [costPoints, setCostPoints] = useState<readonly UiCostDailyPoint[]>(props.initialCostPoints);
  const [selectedSessionId, setSelectedSessionId] = useState<string | undefined>(
    props.initialSessions[0]?.sessionId
  );
  const [sessionReplay, setSessionReplay] = useState<UiSessionReplay | undefined>(undefined);
  const [streamStatus, setStreamStatus] = useState<StreamStatus>("connecting");
  const [statusMessage, setStatusMessage] = useState<string>("Connecting to live stream...");
  const [warning, setWarning] = useState<string | undefined>(props.initialWarning);

  const totalCost = useMemo(
    () => sessions.reduce((sum, session) => sum + session.totalCostUsd, 0),
    [sessions]
  );
  const promptCount = useMemo(
    () => sessions.reduce((sum, session) => sum + session.promptCount, 0),
    [sessions]
  );
  const toolCallCount = useMemo(
    () => sessions.reduce((sum, session) => sum + session.toolCallCount, 0),
    [sessions]
  );
  const maxCostPoint = useMemo(
    () => Math.max(0.01, ...costPoints.map((point) => point.totalCostUsd)),
    [costPoints]
  );

  useEffect(() => {
    let active = true;
    let eventSource: EventSource | undefined;

    const loadSnapshot = async (): Promise<void> => {
      try {
        const [sessionsResponse, costResponse] = await Promise.all([
          fetch("/api/sessions", { cache: "no-store" }),
          fetch("/api/analytics/cost/daily", { cache: "no-store" })
        ]);
        if (!sessionsResponse.ok) {
          throw new Error(`sessions snapshot failed (${String(sessionsResponse.status)})`);
        }
        if (!costResponse.ok) {
          throw new Error(`cost snapshot failed (${String(costResponse.status)})`);
        }

        const sessionsPayload = asRecord((await sessionsResponse.json()) as unknown);
        const costPayload = asRecord((await costResponse.json()) as unknown);
        if (sessionsPayload === undefined || costPayload === undefined) {
          throw new Error("snapshot payload is invalid");
        }

        const sessionsRaw = sessionsPayload["sessions"];
        const pointsRaw = costPayload["points"];
        if (!Array.isArray(sessionsRaw) || !Array.isArray(pointsRaw)) {
          throw new Error("snapshot arrays are missing");
        }

        const parsedSessions = sessionsRaw.map((entry) => parseSessionSummary(entry)).filter(
          (entry): entry is UiSessionSummary => entry !== undefined
        );
        const parsedCostPoints = pointsRaw.map((entry) => parseCostPoint(entry)).filter(
          (entry): entry is UiCostDailyPoint => entry !== undefined
        );

        if (!active) {
          return;
        }
        setSessions(parsedSessions);
        setCostPoints(parsedCostPoints);
        setWarning(undefined);
        if (streamStatus === "error") {
          setStreamStatus("polling");
          setStatusMessage("Live stream unavailable. Polling every 15 seconds.");
        }
      } catch (error: unknown) {
        if (!active) {
          return;
        }
        setWarning(String(error));
        setStreamStatus("error");
        setStatusMessage("Data refresh failed.");
      }
    };

    void loadSnapshot();
    const interval = setInterval(() => {
      void loadSnapshot();
    }, 15000);

    if (typeof EventSource !== "undefined") {
      eventSource = new EventSource("/api/sessions/stream");
      eventSource.addEventListener("sessions", (event) => {
        const message = event as MessageEvent<string>;
        const payload = asRecord(JSON.parse(message.data) as unknown);
        if (payload === undefined) {
          return;
        }
        const sessionsRaw = payload["sessions"];
        if (!Array.isArray(sessionsRaw)) {
          return;
        }

        const parsedSessions = sessionsRaw.map((entry) => parseSessionSummary(entry)).filter(
          (entry): entry is UiSessionSummary => entry !== undefined
        );
        if (!active) {
          return;
        }
        setSessions(parsedSessions);
        setStreamStatus("live");
        setStatusMessage("Live sessions stream active.");
      });
      eventSource.addEventListener("bridge_error", (event) => {
        const message = event as MessageEvent<string>;
        if (!active) {
          return;
        }
        setStreamStatus("error");
        setStatusMessage(`Stream bridge error: ${message.data}`);
      });
      eventSource.onerror = () => {
        if (!active) {
          return;
        }
        setStreamStatus("polling");
        setStatusMessage("Stream disconnected. Polling mode active.");
      };
    } else {
      setStreamStatus("polling");
      setStatusMessage("EventSource is unavailable. Polling mode active.");
    }

    return () => {
      active = false;
      clearInterval(interval);
      if (eventSource !== undefined) {
        eventSource.close();
      }
    };
  }, [streamStatus]);

  useEffect(() => {
    if (sessions.length === 0) {
      setSelectedSessionId(undefined);
      return;
    }

    const selectedStillExists =
      selectedSessionId !== undefined && sessions.some((session) => session.sessionId === selectedSessionId);
    if (!selectedStillExists) {
      setSelectedSessionId(sessions[0]?.sessionId);
    }
  }, [sessions, selectedSessionId]);

  useEffect(() => {
    if (selectedSessionId === undefined) {
      setSessionReplay(undefined);
      return;
    }

    let active = true;
    const loadReplay = async (): Promise<void> => {
      try {
        const response = await fetch(`/api/session/${encodeURIComponent(selectedSessionId)}`, {
          cache: "no-store"
        });
        if (response.status === 404) {
          if (active) {
            setSessionReplay(undefined);
          }
          return;
        }
        if (!response.ok) {
          throw new Error(`replay request failed (${String(response.status)})`);
        }

        const payload = asRecord((await response.json()) as unknown);
        if (payload === undefined || readString(payload, "status") !== "ok") {
          throw new Error("replay payload is invalid");
        }

        const replay = parseReplay(payload["session"]);
        if (!active) {
          return;
        }
        setSessionReplay(replay);
      } catch (error: unknown) {
        if (!active) {
          return;
        }
        setWarning(String(error));
      }
    };

    void loadReplay();
    return () => {
      active = false;
    };
  }, [selectedSessionId]);

  return (
    <main className="dashboard-shell">
      <section className="hero">
        <h1 className="hero-title">agent-trace command center</h1>
        <p className="hero-subtitle">
          Dark-mode observability for coding agents: sessions, costs, and replay chains.
        </p>
        <div className={`status-banner${warning !== undefined ? " warning" : ""}`}>
          {warning ?? statusMessage}
        </div>
      </section>

      <section className="metrics-grid">
        <article className="metric-card">
          <div className="metric-label">Sessions</div>
          <div className="metric-value green">{String(sessions.length)}</div>
        </article>
        <article className="metric-card">
          <div className="metric-label">Total Cost</div>
          <div className="metric-value orange">{formatMoney(totalCost)}</div>
        </article>
        <article className="metric-card">
          <div className="metric-label">Prompts</div>
          <div className="metric-value teal">{String(promptCount)}</div>
        </article>
        <article className="metric-card">
          <div className="metric-label">Tool Calls</div>
          <div className="metric-value">{String(toolCallCount)}</div>
        </article>
      </section>

      <section className="section-grid">
        <section className="panel">
          <header className="panel-header">
            <div>
              <h2 className="panel-title">Live Sessions</h2>
              <p className="panel-subtitle">
                {streamStatus === "live" ? "streaming" : streamStatus === "polling" ? "polling" : "initializing"}
              </p>
            </div>
          </header>
          <div className="panel-content">
            {sessions.length === 0 ? (
              <div className="empty-state">No sessions captured yet.</div>
            ) : (
              <table className="session-table">
                <thead>
                  <tr>
                    <th>Session</th>
                    <th>User</th>
                    <th>Repo</th>
                    <th>Started</th>
                    <th>Cost</th>
                    <th>Prompts</th>
                  </tr>
                </thead>
                <tbody>
                  {sessions.map((session) => (
                    <tr
                      key={session.sessionId}
                      className={`session-row${session.sessionId === selectedSessionId ? " active" : ""}`}
                      onClick={() => setSelectedSessionId(session.sessionId)}
                    >
                      <td>{session.sessionId}</td>
                      <td>{session.userId}</td>
                      <td>{session.gitRepo ?? "-"}</td>
                      <td>{formatDate(session.startedAt)}</td>
                      <td>{formatMoney(session.totalCostUsd)}</td>
                      <td>{String(session.promptCount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>

        <section className="panel">
          <header className="panel-header">
            <div>
              <h2 className="panel-title">Daily Cost</h2>
              <p className="panel-subtitle">model-agnostic spend trend</p>
            </div>
          </header>
          <div className="panel-content">
            {costPoints.length === 0 ? (
              <div className="empty-state">No cost points yet.</div>
            ) : (
              <div className="chart">
                {costPoints.slice(-7).map((point) => (
                  <div key={point.date} className="chart-col">
                    <div
                      className="chart-bar"
                      style={{
                        height: `${String(Math.max(6, Math.round((point.totalCostUsd / maxCostPoint) * 150)))}px`
                      }}
                    />
                    <div className="chart-value">{formatMoney(point.totalCostUsd)}</div>
                    <div className="chart-label">{point.date.slice(5)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </section>

      <section className="panel" style={{ marginTop: "14px" }}>
        <header className="panel-header">
          <div>
            <h2 className="panel-title">Session Replay</h2>
            <p className="panel-subtitle">
              {selectedSessionId === undefined ? "select a session" : `selected: ${selectedSessionId}`}
            </p>
          </div>
        </header>
        <div className="panel-content">
          {sessionReplay === undefined ? (
            <div className="empty-state">Session replay is unavailable for this selection.</div>
          ) : (
            <>
              <div className="timeline-meta">
                <span className="timeline-meta-item">Started: {formatDate(sessionReplay.startedAt)}</span>
                <span className="timeline-meta-item">
                  Cost: <span className="badge orange">{formatMoney(sessionReplay.metrics.totalCostUsd)}</span>
                </span>
                <span className="timeline-meta-item">
                  Prompts: <span className="badge green">{String(sessionReplay.metrics.promptCount)}</span>
                </span>
                <span className="timeline-meta-item">
                  Tools: <span className="badge">{String(sessionReplay.metrics.toolCallCount)}</span>
                </span>
                <span className="timeline-meta-item">
                  Tokens: <span className="badge teal">
                    {String(sessionReplay.metrics.totalInputTokens)} in / {String(sessionReplay.metrics.totalOutputTokens)} out
                  </span>
                </span>
                {(sessionReplay.metrics.linesAdded > 0 || sessionReplay.metrics.linesRemoved > 0) && (
                  <span className="timeline-meta-item">
                    Lines: <span className="badge green">+{String(sessionReplay.metrics.linesAdded)}</span>
                    {" "}<span className="badge red">-{String(sessionReplay.metrics.linesRemoved)}</span>
                  </span>
                )}
                {sessionReplay.metrics.modelsUsed.length > 0 && (
                  <span className="timeline-meta-item">
                    Models: {sessionReplay.metrics.modelsUsed.join(", ")}
                  </span>
                )}
                {sessionReplay.metrics.toolsUsed.length > 0 && (
                  <span className="timeline-meta-item">
                    Tool types: {sessionReplay.metrics.toolsUsed.join(", ")}
                  </span>
                )}
                {sessionReplay.metrics.filesTouched.length > 0 && (
                  <span className="timeline-meta-item">
                    Files: {String(sessionReplay.metrics.filesTouched.length)} touched
                  </span>
                )}
              </div>
              {sessionReplay.commits.length > 0 && (
                <div style={{ marginBottom: "12px" }}>
                  <h3 style={{ fontSize: "13px", color: "var(--text-secondary)", marginBottom: "6px" }}>
                    Commits ({String(sessionReplay.commits.length)})
                  </h3>
                  <table className="timeline-table">
                    <thead>
                      <tr>
                        <th>SHA</th>
                        <th>Message</th>
                        <th>Prompt ID</th>
                        <th>Committed At</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sessionReplay.commits.map((commit) => (
                        <tr key={commit.sha}>
                          <td>{commit.sha.slice(0, 8)}</td>
                          <td>{commit.message ?? "-"}</td>
                          <td>{commit.promptId ?? "-"}</td>
                          <td>{commit.committedAt !== undefined ? formatDate(commit.committedAt) : "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {sessionReplay.timeline.length === 0 ? (
                <div className="empty-state">No timeline events in this session.</div>
              ) : (
                <table className="timeline-table">
                  <thead>
                    <tr>
                      <th>Timestamp</th>
                      <th>Type</th>
                      <th>Tool</th>
                      <th>Status</th>
                      <th>Duration</th>
                      <th>Cost</th>
                      <th>Tokens</th>
                      <th>Prompt ID</th>
                      <th>Detail</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sessionReplay.timeline.map((event) => (
                      <tr key={event.id}>
                        <td>{formatDate(event.timestamp)}</td>
                        <td>{event.type}</td>
                        <td>{event.toolName ?? "-"}</td>
                        <td>
                          <span
                            className={`badge ${
                              event.status === "error"
                                ? "red"
                                : event.status === "ok" || event.status === "success"
                                  ? "green"
                                  : ""
                            }`}
                          >
                            {event.status ?? "-"}
                          </span>
                        </td>
                        <td>{event.toolDurationMs === undefined ? "-" : `${String(event.toolDurationMs)}ms`}</td>
                        <td>{event.costUsd === undefined ? "-" : formatMoney(event.costUsd)}</td>
                        <td>
                          {event.inputTokens === undefined && event.outputTokens === undefined
                            ? "-"
                            : `${String(event.inputTokens ?? 0)} / ${String(event.outputTokens ?? 0)}`}
                        </td>
                        <td>{event.promptId ?? "-"}</td>
                        <td>{event.detail === undefined ? "-" : shortenText(event.detail)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </>
          )}
        </div>
      </section>
    </main>
  );
}
