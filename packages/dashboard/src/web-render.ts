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
            </tr>
          </thead>
          <tbody id="sessions-body">
            <tr><td colspan="5">Loading sessions...</td></tr>
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

      function renderSessions(sessions) {
        if (!Array.isArray(sessions) || sessions.length === 0) {
          sessionsBody.innerHTML = "<tr><td colspan=\\"5\\">No sessions yet.</td></tr>";
          sessionsMetric.textContent = "0";
          costMetric.textContent = "$0.00";
          latestMetric.textContent = "-";
          return;
        }

        const rows = sessions.map((session) => {
          const repo = session.gitRepo ?? "-";
          const cost = typeof session.totalCostUsd === "number" ? session.totalCostUsd : 0;
          return "<tr>"
            + "<td>" + session.sessionId + "</td>"
            + "<td>" + session.userId + "</td>"
            + "<td>" + repo + "</td>"
            + "<td>" + formatDate(session.startedAt) + "</td>"
            + "<td>" + formatMoney(cost) + "</td>"
            + "</tr>";
        }).join("");
        sessionsBody.innerHTML = rows;

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
          sessionsBody.innerHTML = "<tr><td colspan=\\"5\\">Failed to load sessions.</td></tr>";
          status.classList.add("error");
          status.textContent = String(error);
        }
      }

      void loadSessions();
    </script>
  </body>
</html>`;
}
