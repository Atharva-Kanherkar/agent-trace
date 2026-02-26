# agent-trace

**Self-hosted observability for AI coding agents.**

See exactly what your AI coding agent did — every prompt, every tool call, every file touched, every dollar spent. Runs on your infrastructure, your data never leaves.

---

## Two Ways to Run

| | **npx (standalone)** | **Docker (full stack)** |
|---|---|---|
| **Install** | `npx agent-trace@latest` | `git clone` + `./scripts/start-stack.sh` |
| **Database** | SQLite (single file) | ClickHouse + PostgreSQL |
| **Best for** | Solo developer, single machine | Teams, production, long-term analytics |
| **Setup time** | 30 seconds | 2 minutes |
| **Dependencies** | Node.js 18+ | Docker |
| **Dashboard** | Included (port 3100) | Next.js app (port 3100) |
| **OTEL gRPC** | Not available | Port 4717 |
| **Data location** | `~/.agent-trace/data.db` | Docker volumes |

**Use npx** if you're a solo developer who wants to try agent-trace in under a minute. Everything runs in a single process with zero dependencies beyond Node.js.

**Use Docker** if you need persistent analytics across machines, team-wide dashboards, ClickHouse-powered queries, or OpenTelemetry gRPC ingestion.

---

## Option A: npx (Standalone)

### 1. Start the server

```bash
npx agent-trace@latest
```

This starts the collector, API, and dashboard in a single process with a local SQLite database at `~/.agent-trace/data.db`. Sessions persist across restarts.

### 2. Connect Claude Code

```bash
npx agent-trace@latest init --privacy-tier 2
```

This wires up Claude Code's hooks so every session is automatically captured. Restart Claude Code after running this.

### 3. Open the dashboard

```
http://127.0.0.1:3100
```

### Configuration

Environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `COLLECTOR_PORT` | `8317` | Hook ingest port |
| `API_PORT` | `8318` | API port |
| `DASHBOARD_PORT` | `3100` | Dashboard port |
| `SQLITE_DB_PATH` | `~/.agent-trace/data.db` | Database file path |
| `OTEL_PRIVACY_TIER` | `2` | Privacy tier (1, 2, or 3) |

### CLI commands

```bash
npx agent-trace@latest              # Start the server
npx agent-trace@latest init         # Configure Claude Code hooks
npx agent-trace@latest status       # Check if hooks are installed
npx agent-trace@latest --help       # Show all options
```

Init options:

```bash
npx agent-trace@latest init \
  --collector-url http://127.0.0.1:8317/v1/hooks \
  --privacy-tier 2
```

---

## Option B: Docker (Full Stack)

### 1. Start the stack

```bash
git clone https://github.com/Atharva-Kanherkar/agent-trace.git
cd agent-trace
./scripts/start-stack.sh
```

This spins up ClickHouse, PostgreSQL, the collector, API, and a Next.js dashboard via Docker Compose.

### 2. Connect Claude Code

```bash
npm ci && npm run --workspace @agent-trace/cli build && npm link --workspace @agent-trace/cli

agent-trace init \
  --collector-url http://127.0.0.1:8317/v1/hooks \
  --privacy-tier 2
```

Restart Claude Code. Sessions appear automatically.

### 3. Open the dashboard

```
http://127.0.0.1:3100
```

### Ports

| Port | Service |
|------|---------|
| `3100` | Dashboard (Next.js) |
| `8317` | Collector (hook ingest) |
| `8318` | API |
| `4717` | OTEL gRPC receiver |

### Scripts

```bash
./scripts/start-stack.sh       # Start production stack
./scripts/start-stack.sh dev   # Start with hot reload
./scripts/stop-stack.sh        # Stop the stack
./scripts/health-check.sh      # Check all services
```

---

## What You Get

**Session replay, grouped by prompt.** For each thing you asked, see exactly what happened:

- What tools were called (Bash commands, file reads, writes, edits, searches)
- What files were touched and what changed (syntax-highlighted diffs)
- What the agent responded (with code blocks highlighted per language)
- How much it cost and how many tokens it used

**Git outcomes.** See which sessions produced commits (sha, message, timestamp), opened pull requests, and what branch the work happened on.

**Quality signals at a glance.** The session list shows which sessions produced commits, how many lines changed, and total cost — so you can immediately tell which sessions were productive and which spun in circles.

**Cost tracking.** Daily spend charts broken down by session. Know exactly where your token budget is going.

**Live updates.** Sessions stream in real-time via SSE. No manual refresh needed.

## Privacy Tiers

Control what gets stored. Set during init with `--privacy-tier <level>`:

| Tier | What is stored |
|------|---------------|
| **1** | Metadata only — session IDs, timestamps, token counts, cost |
| **2** | Metadata + prompts + tool call details (file paths, commands, diffs) |
| **3** | Full payloads including model responses |

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for architecture, development setup, and code structure.

## License

Apache-2.0
