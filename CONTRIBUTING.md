# Contributing to agent-trace

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

Three ingestion paths feed into the collector: Claude Code hooks (HTTP), OpenTelemetry spans (gRPC), and end-of-session JSONL transcript parsing. Events are deduplicated via SHA256 hashing, projected into session traces in-memory, then persisted to ClickHouse (analytical queries) and PostgreSQL (relational data). The API serves session summaries, replays, and cost analytics. The dashboard consumes the API with SSE for live updates.

## Packages

```
packages/
  schema/        Shared TypeScript types and validators
                 EventEnvelope, AgentSessionTrace, TimelineEvent,
                 SessionMetrics, PrivacyTier (1|2|3), EventSource

  cli/           CLI tool: init, status, hook-handler
                 Installs Claude Code hooks, forwards events to
                 collector, captures git state at session boundaries

  collector/     Event ingestion and deduplication
                 HTTP hook endpoint, gRPC OTEL receiver,
                 JSONL transcript parser with SHA256 dedup

  api/           Query service and REST endpoints
                 Session list, session detail, SSE streaming,
                 timeline queries, cost analytics

  platform/      Database adapters, migrations, row mappers
                 ClickHouse event reader/writer, PostgreSQL client,
                 deterministic UUID generation, datetime normalization

  runtime/       Process orchestrator and service entry point
                 Composes collector + api + projection + persistence,
                 role-based startup, DB-backed or in-memory mode

  dashboard/     Next.js 16 web UI
                 Prompt-centric replay, syntax highlighting,
                 SSE live updates, cost charts
```

## Development Setup

### Prerequisites

- Node.js 20+
- Docker with Compose plugin

### Local development with hot reload

```bash
./scripts/start-stack.sh dev
```

This bind-mounts source directories and enables watch mode.

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

## Environment Variables

### Collector / API / Runtime

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

### Dashboard

| Variable | Default | Description |
|---|---|---|
| `DASHBOARD_API_BASE_URL` | `http://127.0.0.1:8318` | API base URL for data fetching |

## API Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | Health check |
| `GET` | `/v1/sessions` | List sessions with summary metrics |
| `GET` | `/v1/sessions/:id` | Full session replay (timeline, metrics, commits) |
| `GET` | `/v1/sessions/stream` | SSE stream of session updates |
| `GET` | `/v1/timeline` | Timeline events for a session |
| `GET` | `/v1/analytics/cost/daily` | Daily cost aggregation |

## Database Schema

### ClickHouse

**`agent_events`** — Primary event table with columns: `event_id` (UUID), `event_type`, `event_timestamp` (DateTime64), `session_id`, `prompt_id`, `tool_name`, `tool_success`, `tool_duration_ms`, `model`, `cost_usd`, `input_tokens`, `output_tokens`, `attributes` (Map).

**`session_traces`** — Aggregated session data using `ReplacingMergeTree(version)`. Includes git repo/branch, all metrics, commit count.

**Materialized views**: `daily_user_metrics`, `tool_usage_daily`, `model_cost_daily`.

### PostgreSQL

- `users` — User records
- `sessions` — Session metadata and git provenance
- `commits` — Commit SHAs linked to sessions and prompts
- `instance_settings` — Configuration storage

## Migrations

Migration files live in `migrations/clickhouse/` and `migrations/postgres/`. All use `CREATE TABLE IF NOT EXISTS` / `ALTER TABLE ADD COLUMN IF NOT EXISTS` so they're idempotent and safe to re-run.

The migration runner executes all files on startup when `RUNTIME_RUN_MIGRATIONS=true`. There is no state tracking — idempotency is enforced at the SQL level.

**Important**: When stopping the stack, use `docker compose down` (not `docker compose down -v`). The `-v` flag deletes data volumes.

## CLI Internals

### Hook Handler

`agent-trace hook-handler` is invoked by Claude Code on every hook event. It:

1. Parses the JSON payload from stdin
2. Enriches with git metadata (branch, HEAD SHA, diff stats)
3. Tracks session baselines (SessionStart snapshot, SessionEnd delta)
4. Validates and wraps as an `EventEnvelope`
5. POSTs to the collector

Hook events: `SessionStart`, `PostToolUse`, `SessionEnd`, `Stop`, `TaskCompleted`.

### Init

`agent-trace init` writes three files:
- `~/.claude/agent-trace.json` — collector URL and privacy tier config
- `~/.claude/agent-trace-claude-hooks.json` — hook command definitions
- Updates Claude's `settings.json` with hook references and OTEL env vars

## Further Documentation

- [`docs/HLD_LLD.md`](docs/HLD_LLD.md) — High-level and low-level design
- [`docs/STATUS_AND_NEXT_STEPS.md`](docs/STATUS_AND_NEXT_STEPS.md) — Current feature status and next steps
- [`docs/OPERATIONS.md`](docs/OPERATIONS.md) — Deployment and operations runbook
