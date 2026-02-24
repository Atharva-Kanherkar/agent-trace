# agent-trace

**Self-hosted observability for agentic coding workflows.**

Capture, replay, and analyze every AI coding session. agent-trace gives you full visibility into how agentic tools like Claude Code interact with your codebase — token costs, tool usage, session timelines, file diffs, and git provenance — all without sending data to a third party.

---

## Why agent-trace?

AI coding agents are powerful, but opaque. When a team adopts agentic workflows at scale, questions emerge quickly:

- **Cost** — How much are we spending on tokens per day, per project, per developer?
- **Quality** — Which sessions produced commits? Which ones spun in circles?
- **Auditability** — What exactly did the agent do, and in what order?
- **Productivity** — For each prompt, what tools were called, what files were touched, what code was written?
- **Privacy** — Can we observe sessions without shipping prompts to an external service?

agent-trace answers all of these with a lightweight, self-hosted stack you can run with a single `docker compose up`.

---

## Features

### Ingestion

- **Three-layer ingestion** — Captures data via OpenTelemetry gRPC spans, Claude Code hook events, and end-of-session transcript parsing
- **CLI hook system** — Automatically installs into Claude Code's hook lifecycle (`SessionStart`, `SessionEnd`, `PostToolUse`, `Stop`, `TaskCompleted`)
- **Git enrichment** — Captures branch, commit SHA, and diff stats (lines added/removed, files changed) at session boundaries
- **Deduplication** — SHA256-based event deduplication across all ingest paths prevents duplicate processing

### Dashboard

- **Prompt-centric session replay** — Every session is grouped by prompt: for each thing you asked, see exactly what the agent did — which tools it called, which files it read, wrote, or edited, and what it responded
- **Syntax-highlighted code blocks** — Language-aware highlighting (via highlight.js) for Bash output, file writes, edit diffs, and response code blocks across 15+ languages
- **Structured tool views** — Each tool type has its own rendering: Bash shows commands and output, Edit shows old/new diffs, Write shows the produced file content, Read shows file paths, Grep/Glob show search patterns
- **Cost analytics** — Daily token spend trends with breakdowns by model and session
- **Live session tracking** — Real-time session updates via Server-Sent Events (SSE)
- **Pitch-black dark mode** — Monospace, terminal-inspired UI with #000 backgrounds

### Data Pipeline

- **Privacy tiers** — Three configurable levels controlling what data gets stored (metadata-only, +prompts, +full payloads)
- **ClickHouse analytics** — Materialized views for daily user metrics, tool usage, and model cost aggregation
- **PostgreSQL relational data** — Users, sessions, commits, and instance configuration
- **Separate attribute storage** — File paths, edit diffs (old/new strings), write content, and response text are stored as individual ClickHouse attributes with higher size limits, surviving the 500-char tool_input truncation

### Integration

- **Zero cloud dependency** — Runs entirely on your infrastructure
- **Single-command setup** — `agent-trace init` configures Claude Code hooks and OTEL telemetry automatically
- **Docker Compose deployment** — Production and dev compose files with health checks, volume mounts, and migration runners

---

## Architecture

```
Claude Code Sessions
        |
        |  3 ingest paths
        v
+--------------------------------------+
|  COLLECTOR  (port 8317)              |
|  +- HTTP hook ingest   /v1/hooks     |
|  +- OTEL gRPC receiver (port 4717)  |
|  +- Transcript JSONL parser          |
+----------+---------------------------+
           |
     +-----+------+
     v            v
 ClickHouse   PostgreSQL
 (events,     (users,
  traces,      sessions,
  daily MV)    commits)
     +-----+------+
           v
+--------------------------------------+
|  API  (port 8318)                    |
|  +- GET  /v1/sessions                |
|  +- GET  /v1/sessions/:id            |
|  +- GET  /v1/sessions/stream  (SSE)  |
|  +- GET  /v1/timeline                |
|  +- GET  /v1/analytics/cost/daily    |
+----------+---------------------------+
           v
+--------------------------------------+
|  DASHBOARD  (port 3100)              |
|  Next.js - pitch black - monospace   |
+--------------------------------------+
```

---

## Quick Start

### Prerequisites

- Docker with the Compose plugin
- Ports available: `3100`, `4717`, `5432`, `8123`, `8317`, `8318`

### 1. Start the stack

```bash
git clone https://github.com/anthropics/agent-trace.git
cd agent-trace
./scripts/start-stack.sh
```

This brings up ClickHouse, PostgreSQL, the collector, the API, and the dashboard. Migrations run automatically on first boot.

### 2. Connect Claude Code

```bash
# Build and link the CLI
npm ci
npm run --workspace @agent-trace/cli build
npm link --workspace @agent-trace/cli

# Install hooks into Claude Code
agent-trace init \
  --collector-url http://127.0.0.1:8317/v1/hooks \
  --privacy-tier 2

# Verify installation
agent-trace status
```

Restart Claude Code after running `init`. Sessions will begin appearing in the dashboard automatically.

### 3. Open the dashboard

```
http://127.0.0.1:3100
```

---

## What the Dashboard Shows

### Session List

Sessions are sorted latest-first with local timestamps. Each row shows session ID, user, git repo/branch, start time, prompt count, tool call count, and total cost.

### Session Replay (Prompt-Centric)

When you click into a session, each prompt is shown as an expandable card:

1. **Prompt text** — What you asked the agent
2. **Tool calls** — Each tool call with structured detail:
   - **Bash**: Command executed + output (syntax-highlighted)
   - **Read**: File path that was read
   - **Write**: File path + full file content (syntax-highlighted per language)
   - **Edit**: File path + old/new string diff
   - **Grep/Glob**: Search pattern and path
   - **Task**: Subagent prompt and description
3. **File summary** — Compact list of files read and files written/edited
4. **Response** — What the agent replied, with code blocks parsed and syntax-highlighted per language
5. **Metrics** — Cost and token usage per prompt

### Cost Analytics

Daily chart showing token spend over time, broken down by session count, prompt count, and tool call count.

---

## Packages

```
agent-trace/
+-- packages/
|   +-- schema/        Shared TypeScript types and validators
|   |                  EventEnvelope, AgentSessionTrace, TimelineEvent,
|   |                  SessionMetrics, PrivacyTier (1|2|3), EventSource
|   |
|   +-- cli/           CLI tool: init, status, hook-handler
|   |                  Installs Claude Code hooks, forwards events to
|   |                  collector, captures git state at session boundaries
|   |
|   +-- collector/     Event ingestion and deduplication
|   |                  HTTP hook endpoint, gRPC OTEL receiver,
|   |                  JSONL transcript parser with SHA256 dedup
|   |
|   +-- api/           Query service and REST endpoints
|   |                  Session list, session detail, SSE streaming,
|   |                  timeline queries, cost analytics
|   |
|   +-- platform/      Database adapters, migrations, row mappers
|   |                  ClickHouse event reader/writer, PostgreSQL client,
|   |                  deterministic UUID generation, datetime normalization
|   |
|   +-- runtime/       Process orchestrator and service entry point
|   |                  Composes collector + api + projection + persistence,
|   |                  role-based startup, DB-backed or in-memory mode
|   |
|   +-- dashboard/     Next.js 16 web UI
|                      Prompt-centric replay, syntax highlighting,
|                      SSE live updates, cost charts
|
+-- docker/
|   +-- docker-compose.yml       Production stack
|   +-- docker-compose.dev.yml   Dev overrides (bind mounts, watch)
|   +-- runtime.Dockerfile       Collector + API image
|   +-- dashboard.Dockerfile     Dashboard image
|
+-- migrations/
|   +-- clickhouse/    Events table, session traces, materialized views
|   +-- postgres/      Users, sessions, commits, instance settings
|
+-- scripts/           Stack management (start, stop, health check)
+-- docs/              Architecture docs and runbooks
```

---

## Configuration

### Environment Variables

#### Collector / API / Runtime

| Variable | Default | Description |
|---|---|---|
| `RUNTIME_SERVICE_ROLE` | `all` | Service role: `collector`, `api`, or `all` |
| `RUNTIME_RUN_MIGRATIONS` | `true` | Run DB migrations on startup |
| `RUNTIME_HOST` | `127.0.0.1` | Bind address |
| `COLLECTOR_PORT` | `8317` | Collector HTTP port |
| `API_PORT` | `8318` | API HTTP port |
| `OTEL_GRPC_ADDRESS` | `0.0.0.0:4717` | OTEL gRPC listener |
| `CLICKHOUSE_URL` | `http://clickhouse:8123` | ClickHouse connection URL |
| `CLICKHOUSE_USERNAME` | `default` | ClickHouse user |
| `CLICKHOUSE_PASSWORD` | `agent_trace` | ClickHouse password |
| `CLICKHOUSE_DATABASE` | `agent_trace` | ClickHouse database name |
| `POSTGRES_CONNECTION_STRING` | — | PostgreSQL connection string |

#### Dashboard

| Variable | Default | Description |
|---|---|---|
| `DASHBOARD_API_BASE_URL` | `http://127.0.0.1:8318` | API base URL for data fetching |

#### Claude Code (set automatically by `agent-trace init`)

| Variable | Description |
|---|---|
| `CLAUDE_CODE_ENABLE_TELEMETRY` | Enables Claude Code telemetry export |
| `OTEL_EXPORTER_OTLP_PROTOCOL` | Set to `grpc` for OTEL span export |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | Derived from collector URL |
| `OTEL_LOG_USER_PROMPTS` | `1` at privacy tier 2+ |
| `OTEL_LOG_TOOL_DETAILS` | `1` at privacy tier 2+ |

### Privacy Tiers

Configure via `agent-trace init --privacy-tier <level>` or in `~/.claude/agent-trace.json`:

| Tier | What is stored |
|---|---|
| **1** | Metadata only — session IDs, timestamps, token counts, cost |
| **2** | Metadata + user prompts + tool call details (file paths, commands, edit diffs, write content) |
| **3** | Full payloads including model responses |

---

## CLI Commands

### `agent-trace init`

Configures Claude Code to send telemetry and hook events to agent-trace.

```bash
agent-trace init \
  --collector-url http://127.0.0.1:8317/v1/hooks \
  --privacy-tier 2
```

What it does:
- Generates `~/.claude/agent-trace.json` with collector URL and privacy settings
- Writes `~/.claude/agent-trace-claude-hooks.json` with hook commands for all lifecycle events
- Installs hooks into Claude's `settings.json` or `settings.local.json`
- Sets OTEL environment variables for telemetry export

### `agent-trace status`

Shows current configuration and connectivity status.

### `agent-trace hook-handler`

Internal command invoked by Claude Code hooks. Parses hook payloads, enriches with git metadata, validates as EventEnvelopes, and forwards to the collector.

Hook events captured:
- `SessionStart` — Captures baseline git state (branch, commit, diff stats)
- `PostToolUse` — Every tool call with input/output details
- `SessionEnd` — Final metrics delta against baseline
- `Stop` / `TaskCompleted` — Session termination events

---

## API Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | Health check |
| `GET` | `/v1/sessions` | List all sessions with summary metrics |
| `GET` | `/v1/sessions/:id` | Full session replay (timeline, metrics, commits) |
| `GET` | `/v1/sessions/stream` | SSE stream of session updates |
| `GET` | `/v1/timeline` | Timeline events for a session |
| `GET` | `/v1/analytics/cost/daily` | Daily cost aggregation |

---

## Development

### Local development with hot reload

```bash
./scripts/start-stack.sh dev
```

Uses a dev-mode compose override that bind-mounts source directories and enables watch mode.

### Running directly with Node

```bash
npm ci
npm run typecheck
npm run test:unit

# Start the runtime (collector + API)
npm run --workspace @agent-trace/runtime start
```

### Quality gates

```bash
npm run typecheck        # Strict TypeScript across all packages
npm run test:unit        # Unit tests (Node native test runner)
npm run test:manual      # Manual smoke tests

# Per-package
npm run test:feature:collector
npm run test:feature:api
npm run test:feature:dashboard
```

### Helper scripts

| Script | Description |
|---|---|
| `./scripts/start-stack.sh` | Start the production Docker stack |
| `./scripts/start-stack.sh dev` | Start with dev overrides (bind mounts, watch) |
| `./scripts/stop-stack.sh` | Stop the stack |
| `./scripts/health-check.sh` | Verify all services are healthy |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Language | TypeScript 5.9 (strict mode, `exactOptionalPropertyTypes`) |
| Runtime | Node.js 20 |
| Dashboard | Next.js 16, React 19, highlight.js |
| Analytical DB | ClickHouse 24.8 |
| Relational DB | PostgreSQL 16 |
| Ingestion | gRPC (OpenTelemetry), HTTP |
| Monorepo | npm workspaces |
| Containers | Docker Compose |

---

## Database Schema

### ClickHouse

**`agent_events`** — Primary event table

| Column | Type | Description |
|---|---|---|
| `event_id` | UUID | Deterministic UUID from raw event ID |
| `event_type` | String | Event type (tool_call, api_response, etc.) |
| `event_timestamp` | DateTime64(6) | Microsecond-precision timestamp |
| `session_id` | String | Session identifier |
| `prompt_id` | Nullable(String) | Links events to the prompt that caused them |
| `tool_name` | Nullable(String) | Tool name (Bash, Read, Write, Edit, etc.) |
| `tool_success` | Nullable(UInt8) | 1 = success, 0 = error |
| `tool_duration_ms` | Nullable(Float64) | Tool execution duration |
| `model` | Nullable(String) | Model used (claude-sonnet-4-20250514, etc.) |
| `cost_usd` | Nullable(Float64) | Cost in USD |
| `input_tokens` | Nullable(UInt64) | Input token count |
| `output_tokens` | Nullable(UInt64) | Output token count |
| `attributes` | Map(String, String) | Flexible key-value store for tool details |

**Materialized views**: `daily_user_metrics`, `tool_usage_daily`, `model_cost_daily`

### PostgreSQL

- `users` — User records
- `sessions` — Session metadata and git provenance
- `commits` — Commit SHAs linked to sessions
- `instance_settings` — Configuration storage

---

## Roadmap

- **v0.1** (current) — Core platform: ingestion, persistence, prompt-centric session replay, cost analytics, CLI, syntax highlighting
- **v0.2** — Prompt effectiveness scoring, commit provenance linking, PR outcome tracking
- **v0.3** — Team analytics, RBAC, SSO/SAML, audit logs, alerting

---

## Documentation

- [`docs/HLD_LLD.md`](docs/HLD_LLD.md) — High-level and low-level design
- [`docs/STATUS_AND_NEXT_STEPS.md`](docs/STATUS_AND_NEXT_STEPS.md) — Current feature status and next steps
- [`docs/OPERATIONS.md`](docs/OPERATIONS.md) — Deployment and operations runbook

## License

Apache-2.0
