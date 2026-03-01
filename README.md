# agent-trace

**See what Claude Code did, what it cost, and whether it was productive — for individuals and teams.**

You run a Claude Code session. It touches 30 files, makes 47 tool calls, and costs $8.
Was that productive? Did it actually commit anything? Or did it spin in circles?

agent-trace answers that. It captures every session automatically via Claude Code hooks, and gives you a dashboard showing cost, commits, PRs, and full prompt-by-prompt replay. Self-hosted — your data never leaves your machine.

<img width="1785" height="819" alt="Dashboard overview — session list with cost, commits, lines changed, and 7-day spend chart" src="https://github.com/user-attachments/assets/0761c530-cd35-4814-8107-72bf7df83f40" />

---

## Quick Start (30 seconds)

```bash
# 1. Start the server
npx agent-trace@latest

# 2. Connect Claude Code (run once, then restart Claude Code)
npx agent-trace@latest init --privacy-tier 2

# 3. Open the dashboard
open http://127.0.0.1:3100
```

That's it. Every Claude Code session is now captured automatically.

---

## What You See

**Cost per session.** Every session shows exactly how many tokens it used (input, output, cache read/write) and what it cost, using accurate per-model Anthropic pricing.

**Git outcomes.** Which sessions produced commits. Which opened PRs (with state: open, merged, closed, draft). What branch the work happened on. Cost per commit.

<img width="1797" height="846" alt="Session replay — outcome section with commit SHA, branch, lines changed, and numbered prompt timeline" src="https://github.com/user-attachments/assets/6bbf3b59-c8e7-45a3-b0ca-914167cb61bc" />

**Prompt-by-prompt replay.** For each thing you asked, see exactly what happened:
- Bash commands that were run (syntax-highlighted)
- File edits with inline diffs (red/green)
- Files read, searches performed, files written
- Agent response with code blocks highlighted per language

<img width="1797" height="856" alt="Prompt replay — Bash commands and file writes with syntax-highlighted code" src="https://github.com/user-attachments/assets/d972590c-8685-4331-9354-01a25a4014db" />

<img width="1740" height="811" alt="Session replay — PR state badges and implementation plan view" src="https://github.com/user-attachments/assets/10cf89d6-8b52-4421-a48a-c2ff5fc4ead2" />

**Quality signals at a glance.** The session list shows commit count, lines changed (+/-), and cost — so you can immediately tell which sessions were productive and which burned tokens doing nothing.

**Daily cost chart.** 7-day spend overview broken down by session count, prompts, and tool calls.

**Live updates.** Sessions stream in real-time via SSE. No manual refresh.

---

## AI Insights (BYOK)

Bring your own API key to get AI-generated analysis of any session. Supports Anthropic, OpenAI, Gemini, and OpenRouter.

Click the gear icon to configure your provider and API key. Your key is stored locally in SQLite and never sent anywhere except to your chosen provider.

<img width="819" height="637" alt="AI Insights settings — provider selection, API key input, and configuration status" src="https://github.com/user-attachments/assets/de0bd1cc-c6f0-4297-8114-02854b7fd7e9" />

Then click "Generate Insight" on any session to get a summary, highlights, and suggestions.

<img width="1818" height="340" alt="AI-generated session insight — summary, highlights, and cost efficiency note" src="https://github.com/user-attachments/assets/696551bf-3e94-4b3d-8b61-1f5569d6d7eb" />

---

## Team Dashboard

Aggregate cost and productivity across your entire engineering team. One shared server, every developer's sessions forwarded automatically.

### Setup

A manager or team lead spins up a shared agent-trace server (with an auth token to control access):

```bash
TEAM_AUTH_TOKEN=your-secret-token npx agent-trace@latest
```

Each developer on the team connects their local Claude Code to the shared server:

```bash
npx agent-trace@latest init \
  --team-url https://team-server:8317/v1/hooks \
  --team-token your-secret-token \
  --team-privacy-tier 2
```

After this, every Claude Code session is **dual-forwarded** — once to the developer's personal local collector, and once to the team server. The team dashboard aggregates everyone's data.

### What the Team Dashboard Shows

**Team Overview.** Total spend, sessions, commits, PRs, lines changed, and cost-per-commit across all team members for any date range.

**Per-Member Breakdown.** Each developer's cost, session count, commits, PRs, lines added/removed, cost efficiency, and last active timestamp. Sorted by spend.

**Cost Trend.** Daily spend chart with cumulative overlay. Filter by time range (this week, this month, last 30 days).

**Cost Distribution.** Donut chart showing each member's share of total spend.

**Activity Heatmap.** Sessions by hour and day of week — see when the team is most active.

**Top Models & Tools.** Which AI models cost the most, and which tools are used most frequently across the team.

**Per-Member Deep Dive.** Expandable cards for each team member showing their models, tools, repositories, hourly activity, and daily activity patterns.

**Monthly Budget.** Set a monthly spending limit and alert threshold. The dashboard shows current month spend, percentage used, and warns when approaching the limit.

### AI Team Analysis

Generate AI-powered analysis of your team's performance, cost efficiency, and productivity patterns. The AI produces structured output including:

- **Executive Summary** — key findings with specific numbers
- **Cost Analysis** — members ranked by cost efficiency ($/commit)
- **Productivity Analysis** — commit velocity, tool diversity, code output
- **Member Highlights** — per-person strengths, concerns, and recommendations
- **Risks** — budget trajectory, workload imbalance, burnout signals
- **Recommendations** — concrete, actionable suggestions referencing specific members and tools
- **Forecast** — extrapolated monthly spend based on daily trends

### Custom Analysis Prompts

Managers can inject their own company context into the AI analysis so it produces results tailored to their org's needs. Click "Configure Analysis" on the Insights tab to set:

- **Company Context** — describe your company, team structure, project priorities, naming conventions, evaluation criteria
- **Analysis Guidelines** — what the AI should focus on, what metrics matter most, specific thresholds or criteria for performance reviews

The custom context is stored in SQLite and persists across sessions. When set, it's appended to the system prompt so the AI analysis reflects your org's priorities rather than generic advice.

### Team Membership

There is no explicit team management UI. "Team" means **everyone whose data is in the same database**. Developers join by configuring their local agent-trace to forward to the shared team server URL. Anyone with the auth token can view all team data.

### Privacy Tiers for Team Forwarding

Developers control what gets forwarded to the team server via privacy tiers (set during `init`):

| Tier | What is forwarded to the team server |
|------|--------------------------------------|
| **1** | Metadata only — session IDs, timestamps, token counts, cost. Prompts, tool I/O, commit messages, and responses are stripped. |
| **2** | Metadata + tool call details (file paths, commands, diffs). Prompts and assistant responses are stripped. |
| **3** | Full payloads including prompts and model responses. No redaction. |

Privacy tiers are enforced client-side at push time. The team server receives only what the developer's privacy tier allows.

### Authentication

Authentication is controlled by the `TEAM_AUTH_TOKEN` environment variable on the server:

- **If set:** All API, collector, and dashboard endpoints require `Authorization: Bearer <token>`. The dashboard prompts for the token on first visit and stores it in localStorage.
- **If not set:** Everything is open with no authentication.

There is no per-user auth or role-based access control. The token is shared across the team.

---

## How It Works

agent-trace uses Claude Code's [hooks system](https://docs.anthropic.com/en/docs/claude-code/hooks). When you run `agent-trace init`, it registers hooks in `~/.claude/settings.json` that fire on every session event:

| Hook Event | What it captures |
|------------|-----------------|
| `SessionStart` | Session begins — baseline git state |
| `PostToolUse` | Every tool call — Bash, file edits, reads, searches |
| `SessionEnd` | Session ends — final git diff, total lines changed |
| `Stop` | Graceful stop |
| `TaskCompleted` | Task completion |

Each event is enriched with git context (branch, commit SHA, diff stats, PR URLs) and forwarded to a local collector. The collector deduplicates, projects events into session traces, and persists to a SQLite database at `~/.agent-trace/data.db`.

Everything runs in a single process. Sessions persist across restarts.

---

## Configuration

### CLI commands

```bash
npx agent-trace@latest              # Start the server
npx agent-trace@latest init         # Configure Claude Code hooks
npx agent-trace@latest status       # Check if hooks are installed
npx agent-trace@latest --help       # Show all options
```

### Init options

```bash
# Personal only
npx agent-trace@latest init \
  --collector-url http://127.0.0.1:8317/v1/hooks \
  --privacy-tier 2

# Personal + team forwarding
npx agent-trace@latest init \
  --collector-url http://127.0.0.1:8317/v1/hooks \
  --privacy-tier 2 \
  --team-url https://team-server:8317/v1/hooks \
  --team-token your-secret-token \
  --team-privacy-tier 2
```

### Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `COLLECTOR_PORT` | `8317` | Hook ingest port |
| `API_PORT` | `8318` | API port |
| `DASHBOARD_PORT` | `3100` | Dashboard port |
| `SQLITE_DB_PATH` | `~/.agent-trace/data.db` | Database file path |
| `TEAM_AUTH_TOKEN` | *(none)* | Bearer token for API/collector auth. If set, all endpoints require this token. |

### Privacy Tiers

Control what gets stored. Set during init with `--privacy-tier <level>`:

| Tier | What is stored |
|------|---------------|
| **1** | Metadata only — session IDs, timestamps, token counts, cost |
| **2** | Metadata + prompts + tool call details (file paths, commands, diffs) |
| **3** | Full payloads including model responses |

### Verifying hooks

```bash
npx agent-trace@latest status
```

If hooks aren't showing, re-run `npx agent-trace@latest init --privacy-tier 2` and restart Claude Code.

---

## Docker (Full Stack)

For teams or long-term analytics, there's a Docker Compose setup with ClickHouse + PostgreSQL:

```bash
git clone https://github.com/Atharva-Kanherkar/agent-trace.git
cd agent-trace
./scripts/start-stack.sh
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for details on the Docker architecture.

---

## Roadmap

- [ ] Export and integrations — CSV export, webhooks, GitHub Action for PR cost comments ([#2](https://github.com/Atharva-Kanherkar/agent-trace/issues/2))
- [ ] Multi-agent support — Cursor, Windsurf, Aider, and other AI coding agents

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for architecture, development setup, and code structure.

## License

Apache-2.0
