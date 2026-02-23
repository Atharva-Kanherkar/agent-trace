import type { DashboardRenderOptions } from "./web-types";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

export function renderDashboardHtml(options: DashboardRenderOptions = {}): string {
  const title = options.title ?? "agent-trace dashboard";
  const safeTitle = escapeHtml(title);

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${safeTitle}</title>
    <style>
      :root {
        --paper: #f7f7f2;
        --ink: #121212;
        --accent: #0f766e;
        --accent-soft: #d1fae5;
        --grid: #d6d3d1;
        --warn: #9a3412;
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        color: var(--ink);
        font-family: "Space Grotesk", "IBM Plex Sans", system-ui, sans-serif;
        background:
          radial-gradient(circle at 20% 10%, rgba(15, 118, 110, 0.18), transparent 30%),
          radial-gradient(circle at 80% 0%, rgba(217, 119, 6, 0.15), transparent 35%),
          linear-gradient(145deg, #f5f5f4, var(--paper));
      }

      .shell {
        max-width: 1100px;
        margin: 0 auto;
        padding: 28px 18px 40px;
      }

      .hero {
        border: 2px solid var(--ink);
        background: #fff;
        box-shadow: 8px 8px 0 var(--ink);
        padding: 22px 20px;
      }

      .hero h1 {
        margin: 0;
        font-size: clamp(1.7rem, 2.4vw, 2.3rem);
        letter-spacing: -0.02em;
      }

      .hero p {
        margin: 10px 0 0;
        color: #3f3f46;
      }

      .grid {
        margin-top: 18px;
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 12px;
      }

      .metric {
        border: 1px solid var(--grid);
        background: #fff;
        padding: 12px;
      }

      .metric .label {
        font-size: 0.78rem;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: #52525b;
      }

      .metric .value {
        margin-top: 6px;
        font-size: 1.35rem;
        font-weight: 700;
      }

      .panel {
        margin-top: 18px;
        border: 2px solid var(--ink);
        background: #fff;
        box-shadow: 8px 8px 0 var(--ink);
        overflow: hidden;
      }

      .panel header {
        padding: 12px 14px;
        background: var(--accent-soft);
        border-bottom: 2px solid var(--ink);
        font-weight: 700;
      }

      table {
        width: 100%;
        border-collapse: collapse;
      }

      th, td {
        padding: 10px 12px;
        border-bottom: 1px solid var(--grid);
        text-align: left;
        font-size: 0.95rem;
      }

      th {
        font-size: 0.8rem;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        color: #57534e;
        background: #fafaf9;
      }

      .status {
        margin-top: 12px;
        padding: 10px 12px;
        border: 1px solid var(--grid);
        background: #fff;
      }

      .status.error {
        color: var(--warn);
        border-color: #fca5a5;
        background: #fef2f2;
      }

      @media (max-width: 840px) {
        .grid {
          grid-template-columns: 1fr;
        }

        th:nth-child(4),
        td:nth-child(4) {
          display: none;
        }
      }
    </style>
  </head>
  <body>
    <main class="shell">
      <section class="hero">
        <h1>${safeTitle}</h1>
        <p>Session-level observability for coding agents, running locally.</p>
      </section>

      <section class="grid">
        <article class="metric">
          <div class="label">Sessions</div>
          <div class="value" id="metric-sessions">0</div>
        </article>
        <article class="metric">
          <div class="label">Total Cost (USD)</div>
          <div class="value" id="metric-cost">$0.00</div>
        </article>
        <article class="metric">
          <div class="label">Latest Start</div>
          <div class="value" id="metric-latest">-</div>
        </article>
      </section>

      <section class="panel">
        <header>Recent Sessions</header>
        <table>
          <thead>
            <tr>
              <th>Session</th>
              <th>User</th>
              <th>Repo</th>
              <th>Started</th>
              <th>Cost</th>
              <th>Replay</th>
            </tr>
          </thead>
          <tbody id="sessions-body">
            <tr><td colspan="6">Loading sessions...</td></tr>
          </tbody>
        </table>
      </section>

      <section class="panel">
        <header>Session Replay</header>
        <div id="replay-meta" class="status">Select a session to inspect timeline events.</div>
        <table>
          <thead>
            <tr>
              <th>Timestamp</th>
              <th>Type</th>
              <th>Status</th>
              <th>Cost</th>
              <th>Prompt</th>
            </tr>
          </thead>
          <tbody id="replay-body">
            <tr><td colspan="5">No session selected.</td></tr>
          </tbody>
        </table>
      </section>

      <section id="status" class="status">Fetching data from local API bridge...</section>
    </main>
    <script>
      const sessionsBody = document.getElementById("sessions-body");
      const status = document.getElementById("status");
      const sessionsMetric = document.getElementById("metric-sessions");
      const costMetric = document.getElementById("metric-cost");
      const latestMetric = document.getElementById("metric-latest");
      const replayMeta = document.getElementById("replay-meta");
      const replayBody = document.getElementById("replay-body");
      let selectedSessionId = null;

      function formatMoney(value) {
        return "$" + value.toFixed(2);
      }

      function formatDate(value) {
        try {
          return new Date(value).toLocaleString();
        } catch {
          return value;
        }
      }

      function escapeHtml(value) {
        return String(value)
          .replaceAll("&", "&amp;")
          .replaceAll("<", "&lt;")
          .replaceAll(">", "&gt;")
          .replaceAll("\"", "&quot;")
          .replaceAll("'", "&#39;");
      }

      function setReplayPlaceholder(message) {
        replayBody.innerHTML = "<tr><td colspan=\\"5\\">" + escapeHtml(message) + "</td></tr>";
      }

      function renderSessionReplay(session) {
        if (typeof session !== "object" || session === null) {
          replayMeta.classList.add("error");
          replayMeta.textContent = "Replay payload is invalid.";
          setReplayPlaceholder("Replay payload is invalid.");
          return;
        }

        const timeline = Array.isArray(session.timeline) ? session.timeline : [];
        const promptCount = typeof session.metrics?.promptCount === "number" ? session.metrics.promptCount : 0;
        const toolCallCount = typeof session.metrics?.toolCallCount === "number" ? session.metrics.toolCallCount : 0;
        const totalCostUsd = typeof session.metrics?.totalCostUsd === "number" ? session.metrics.totalCostUsd : 0;
        replayMeta.classList.remove("error");
        replayMeta.textContent = "Session " + session.sessionId + " | prompts " + promptCount
          + " | tools " + toolCallCount + " | cost " + formatMoney(totalCostUsd);

        if (timeline.length === 0) {
          setReplayPlaceholder("No timeline events for this session.");
          return;
        }

        const rows = timeline.map((event) => {
          const timestamp = typeof event.timestamp === "string" ? formatDate(event.timestamp) : "-";
          const type = typeof event.type === "string" ? event.type : "-";
          const eventStatus = typeof event.status === "string" ? event.status : "-";
          const cost = typeof event.costUsd === "number" ? formatMoney(event.costUsd) : "-";
          const prompt = typeof event.promptId === "string" ? event.promptId : "-";
          return "<tr>"
            + "<td>" + escapeHtml(timestamp) + "</td>"
            + "<td>" + escapeHtml(type) + "</td>"
            + "<td>" + escapeHtml(eventStatus) + "</td>"
            + "<td>" + escapeHtml(cost) + "</td>"
            + "<td>" + escapeHtml(prompt) + "</td>"
            + "</tr>";
        }).join("");
        replayBody.innerHTML = rows;
      }

      async function loadSessionReplay(sessionId) {
        selectedSessionId = sessionId;
        try {
          const response = await fetch("/api/session/" + encodeURIComponent(sessionId));
          if (response.status === 404) {
            replayMeta.classList.add("error");
            replayMeta.textContent = "Session replay not found.";
            setReplayPlaceholder("Session replay not found.");
            return;
          }
          if (!response.ok) {
            throw new Error("session replay bridge failed with status " + response.status);
          }
          const payload = await response.json();
          if (payload?.status !== "ok" || typeof payload.session !== "object") {
            throw new Error("unexpected replay payload format");
          }
          renderSessionReplay(payload.session);
        } catch (error) {
          replayMeta.classList.add("error");
          replayMeta.textContent = String(error);
          setReplayPlaceholder("Failed to load replay.");
        }
      }

      function bindReplayButtons() {
        const buttons = sessionsBody.querySelectorAll(".replay-button");
        buttons.forEach((button) => {
          button.addEventListener("click", () => {
            const sessionId = button.getAttribute("data-session-id");
            if (sessionId === null || sessionId.length === 0) {
              return;
            }
            void loadSessionReplay(sessionId);
          });
        });
      }

      function renderSessions(sessions) {
        if (!Array.isArray(sessions) || sessions.length === 0) {
          sessionsBody.innerHTML = "<tr><td colspan=\\"6\\">No sessions yet.</td></tr>";
          sessionsMetric.textContent = "0";
          costMetric.textContent = "$0.00";
          latestMetric.textContent = "-";
          replayMeta.classList.remove("error");
          replayMeta.textContent = "Select a session to inspect timeline events.";
          setReplayPlaceholder("No session selected.");
          return;
        }

        const rows = sessions.map((session) => {
          const repo = session.gitRepo ?? "-";
          const cost = typeof session.totalCostUsd === "number" ? session.totalCostUsd : 0;
          return "<tr>"
            + "<td>" + escapeHtml(session.sessionId) + "</td>"
            + "<td>" + escapeHtml(session.userId) + "</td>"
            + "<td>" + escapeHtml(repo) + "</td>"
            + "<td>" + escapeHtml(formatDate(session.startedAt)) + "</td>"
            + "<td>" + escapeHtml(formatMoney(cost)) + "</td>"
            + "<td><button type=\\"button\\" class=\\"replay-button\\" data-session-id=\\""
            + escapeHtml(session.sessionId)
            + "\\">View</button></td>"
            + "</tr>";
        }).join("");
        sessionsBody.innerHTML = rows;
        bindReplayButtons();

        const totalCost = sessions.reduce((sum, session) => {
          const value = typeof session.totalCostUsd === "number" ? session.totalCostUsd : 0;
          return sum + value;
        }, 0);
        const latest = sessions
          .map((session) => session.startedAt)
          .filter((value) => typeof value === "string")
          .sort()
          .at(-1) ?? "-";

        sessionsMetric.textContent = String(sessions.length);
        costMetric.textContent = formatMoney(totalCost);
        latestMetric.textContent = latest === "-" ? "-" : formatDate(latest);

        const selectedInList = selectedSessionId !== null && sessions.some((session) => session.sessionId === selectedSessionId);
        if (!selectedInList && sessions[0]?.sessionId !== undefined) {
          void loadSessionReplay(sessions[0].sessionId);
        }
      }

      async function loadSessions() {
        try {
          const response = await fetch("/api/sessions");
          if (!response.ok) {
            throw new Error("dashboard bridge failed with status " + response.status);
          }
          const payload = await response.json();
          if (payload?.status !== "ok" || !Array.isArray(payload.sessions)) {
            throw new Error("unexpected payload format");
          }
          renderSessions(payload.sessions);
          status.classList.remove("error");
          status.textContent = "Data source connected.";
        } catch (error) {
          sessionsBody.innerHTML = "<tr><td colspan=\\"6\\">Failed to load sessions.</td></tr>";
          status.classList.add("error");
          status.textContent = String(error);
        }
      }

      function startLiveSessionsStream() {
        if (typeof EventSource === "undefined") {
          status.classList.remove("error");
          status.textContent = "Live stream unavailable. Snapshot mode enabled.";
          return;
        }

        status.classList.remove("error");
        status.textContent = "Connecting to live session stream...";

        const stream = new EventSource("/api/sessions/stream");
        stream.addEventListener("sessions", (event) => {
          try {
            const payload = JSON.parse(event.data);
            if (payload?.status !== "ok" || !Array.isArray(payload.sessions)) {
              throw new Error("unexpected stream payload");
            }
            renderSessions(payload.sessions);
            status.classList.remove("error");
            status.textContent = "Live session stream connected.";
          } catch (error) {
            status.classList.add("error");
            status.textContent = String(error);
          }
        });

        stream.addEventListener("bridge_error", (event) => {
          status.classList.add("error");
          status.textContent = "Bridge error: " + event.data;
        });

        stream.onerror = () => {
          status.classList.add("error");
          status.textContent = "Live stream disconnected. Retrying...";
        };
      }

      async function boot() {
        await loadSessions();
        startLiveSessionsStream();
      }

      void boot();
    </script>
  </body>
</html>`;
}
