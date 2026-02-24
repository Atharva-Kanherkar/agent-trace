# agent-trace

**Self-hosted observability for AI coding agents.**

See exactly what your AI coding agent did — every prompt, every tool call, every file touched, every dollar spent. Runs on your infrastructure, your data never leaves.

## Quick Start

### 1. Start the stack

```bash
git clone https://github.com/anthropics/agent-trace.git
cd agent-trace
./scripts/start-stack.sh
```

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

## What You Get

**Session replay, grouped by prompt.** For each thing you asked, see exactly what happened:

- What tools were called (Bash commands, file reads, writes, edits, searches)
- What files were touched and what changed (syntax-highlighted diffs)
- What the agent responded (with code blocks highlighted per language)
- How much it cost and how many tokens it used

**Quality signals at a glance.** The session list shows which sessions produced commits, how many lines changed, and total cost — so you can immediately tell which sessions were productive and which spun in circles.

**Cost tracking.** Daily spend charts broken down by session. Know exactly where your token budget is going.

**Live updates.** Sessions stream in real-time via SSE. No manual refresh needed.

## Privacy Tiers

Control what gets stored. Set during `agent-trace init --privacy-tier <level>`:

| Tier | What is stored |
|------|---------------|
| **1** | Metadata only — session IDs, timestamps, token counts, cost |
| **2** | Metadata + prompts + tool call details (file paths, commands, diffs) |
| **3** | Full payloads including model responses |

## CLI

```bash
agent-trace init     # Wire up Claude Code hooks + OTEL telemetry
agent-trace status   # Check config and connectivity
```

## Stack

Runs via Docker Compose: ClickHouse (analytics), PostgreSQL (sessions/commits), collector, API, and a Next.js dashboard. All on `localhost`, no cloud dependency.

| Port | Service |
|------|---------|
| `3100` | Dashboard |
| `8317` | Collector (hook ingest) |
| `8318` | API |
| `4717` | OTEL gRPC receiver |

## Scripts

```bash
./scripts/start-stack.sh       # Start production stack
./scripts/start-stack.sh dev   # Start with hot reload
./scripts/stop-stack.sh        # Stop the stack
./scripts/health-check.sh      # Check all services
```

## Roadmap

- **v0.1** (current) — Session replay, cost analytics, CLI, syntax highlighting, git commit tracking
- **v0.2** — Prompt effectiveness scoring, PR outcome tracking, revert detection
- **v0.3** — Team analytics, RBAC, alerting

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for architecture, development setup, and code structure.

## License

Apache-2.0
