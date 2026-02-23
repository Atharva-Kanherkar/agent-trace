# agent-trace Architecture (HLD + LLD)

Status: Draft v0.1
Date: 2026-02-23
Owner: agent-trace core team

## 1) Purpose

`agent-trace` is a self-hosted observability platform for coding agents, starting with Claude Code.  
It captures what happened in a coding session, what it cost, and what outcome it produced, while keeping data local.

## 2) Product Goals

### Primary goals

1. Capture end-to-end agent session telemetry with no cloud dependency.
2. Reconstruct sessions into a coherent timeline grouped by prompt.
3. Provide cost, token, tool, and git-outcome analytics.
4. Keep privacy controls explicit and enforceable.
5. Be installable with one command (`docker compose up` + `agent-trace init`).

### Non-goals (v0.1)

1. Multi-agent support beyond Claude Code.
2. Enterprise SSO/RBAC and team governance.
3. AI-generated summaries and recommendations.

## 3) Very High-Level Plan

## Phase 0: Repo + contracts (Week 1)

1. Monorepo scaffold and package boundaries.
2. Shared schema package with versioned event contracts.
3. Migration files for ClickHouse and PostgreSQL.

## Phase 1: Ingestion backbone (Weeks 2-3)

1. Collector HTTP + OTLP receiver.
2. Idempotent write path and retry policy.
3. Durable local spool when storage is unavailable.

## Phase 2: Query and replay (Weeks 4-5)

1. Session reconstruction service.
2. API endpoints for sessions/events/analytics.
3. Dashboard session list + replay timeline.

## Phase 3: Installability + operations (Week 6)

1. CLI `init`, `hook-handler`, `status`.
2. Docker Compose wiring and health checks.
3. MVP docs and example setup.

## Phase 4: Hardening (Weeks 7-8)

1. Privacy tier enforcement and redaction tests.
2. Backfill + reprocessing workflow.
3. Performance tuning and retention defaults.

---

## 4) High-Level Design (HLD)

## 4.1 System Context

### Inputs

1. Claude Code OTEL events/metrics via OTLP/gRPC.
2. Claude Code hooks via `stdin` JSON -> HTTP POST.
3. Claude transcript JSONL files parsed on session end.

### Outputs

1. Session replay and analytics in dashboard.
2. REST + SSE API for integrations.
3. Materialized daily metrics by user/project/model/tool.

## 4.2 Architecture Overview

```text
Claude Code
  |- Layer 1: OTEL stream -------------------> Collector (OTLP receiver :4717)
  |- Layer 2: Hook events -------------------> Collector (HTTP :8317)
  '- Layer 3: Transcript path at SessionEnd -> Collector parser

Collector
  |- Validation + version checks
  |- Privacy/redaction pipeline
  |- Enrichment (git metadata, host, repo, branch)
  |- Idempotency/dedup checks
  |- Durable spool + retry writer
  |- ClickHouse writer (events + aggregates)
  '- PostgreSQL writer (relational entities)

API server (:8318)
  |- Session endpoints
  |- Analytics endpoints
  '- SSE live stream

Dashboard (Next.js :3100)
  |- Session list
  |- Session replay
  '- Cost analytics
```

## 4.3 Core Components

1. `@agent-trace/collector`
   - Receives OTLP + hook events.
   - Parses transcript JSONL.
   - Performs enrichment, privacy filtering, and write orchestration.
2. `@agent-trace/api`
   - Exposes REST for querying sessions, timeline, and metrics.
   - Serves SSE channel for in-progress sessions.
3. `@agent-trace/dashboard`
   - Visualizes session list, timeline replay, and cost dashboards.
4. `@agent-trace/cli`
   - `init`: configure Claude Code hooks and env.
   - `hook-handler`: receives hook payload, enriches git info, forwards.
   - `status`: checks service health and config validity.
5. `@agent-trace/schema`
   - Shared TypeScript types and Zod validators.
   - Versioned event contracts and API DTOs.

## 4.4 Deployment Topology

Docker Compose stack:

1. ClickHouse (`8123`, `9000`)
2. PostgreSQL (`5432`)
3. Collector (`4717`, `8317`)
4. API (`8318`)
5. Dashboard (`3100`)

Characteristics:

1. No mandatory external dependency.
2. Single-node by default.
3. Horizontal scaling deferred to post-v0.1.

## 4.5 Reliability Model

Design requirement: ingestion must not block developer workflow.

1. Collector acknowledges hook requests quickly after enqueue.
2. Queue is persisted to local spool (disk-backed) before async writes.
3. Writers retry with exponential backoff and jitter.
4. On repeated failure, records move to dead-letter queue for manual replay.
5. Idempotent writes prevent duplicates during replay/retries.

## 4.6 Privacy Model

Tier 1 (default): metadata only.  
Tier 2: include prompt text and tool args.  
Tier 3: full fidelity content.

Enforcement points:

1. CLI pre-filtering for hook payload.
2. Collector ingress redaction.
3. Storage writer guardrails by tier.

Minimum redaction rules:

1. API keys and token-like patterns.
2. Email and auth headers.
3. Optional path masking for home directories.

## 4.7 Security Baseline

1. API key-based auth for API/Dashboard in v0.1.
2. Secrets via environment variables only.
3. Default bind to localhost unless explicit external mode.
4. Audit fields on sensitive config changes.

## 4.8 Success Metrics (MVP)

1. Ingestion success rate >= 99.5%.
2. End-to-end visibility latency p95 <= 5s for non-transcript events.
3. Session reconstruction completeness >= 98% (events linked to session and prompt).
4. No privacy-tier violations in conformance tests.

---

## 5) Low-Level Design (LLD)

## 5.1 Monorepo Structure

```text
agent-trace/
  docker/
    docker-compose.yml
    docker-compose.dev.yml
  docs/
    ARCHITECTURE_HLD_LLD.md
  migrations/
    clickhouse/
      001_agent_events.sql
      002_session_traces.sql
      003_materialized_views.sql
    postgres/
      001_users.sql
      002_sessions_commits.sql
      003_instance_settings.sql
  packages/
    schema/
    collector/
    api/
    dashboard/
    cli/
  README.md
```

## 5.2 Shared Schema Contracts (`@agent-trace/schema`)

### 5.2.1 Core event envelope

```ts
export interface EventEnvelope<T = unknown> {
  schemaVersion: "1.0";
  source: "otel" | "hook" | "transcript" | "git";
  sourceVersion?: string;
  eventId: string;              // globally unique + deterministic when possible
  sessionId: string;
  promptId?: string;
  eventType: string;
  eventTimestamp: string;       // ISO-8601 UTC
  ingestedAt: string;           // ISO-8601 UTC
  privacyTier: 1 | 2 | 3;
  payload: T;
  attributes?: Record<string, string>;
}
```

### 5.2.2 Session trace response

```ts
export interface AgentSessionTrace {
  sessionId: string;
  agentType: "claude_code";
  user: { id: string; email?: string };
  environment: {
    terminal?: string;
    projectPath?: string;
    gitRepo?: string;
    gitBranch?: string;
  };
  startedAt: string;
  endedAt?: string;
  activeDurationMs: number;
  timeline: TimelineEvent[];
  metrics: {
    promptCount: number;
    apiCallCount: number;
    toolCallCount: number;
    totalCostUsd: number;
    totalInputTokens: number;
    totalOutputTokens: number;
    linesAdded: number;
    linesRemoved: number;
    filesTouched: string[];
    modelsUsed: string[];
    toolsUsed: string[];
  };
  git: {
    commits: CommitInfo[];
    pullRequests: PullRequestInfo[];
  };
}
```

## 5.3 Ingestion Pipeline (`@agent-trace/collector`)

Pipeline stages:

1. `receive`: OTLP receiver / HTTP route `/v1/hooks`.
2. `normalize`: map source-specific payloads into `EventEnvelope`.
3. `validate`: schema + privacy-tier checks.
4. `enrich`: repo metadata, branch, host, user mapping.
5. `redact`: apply tier policy and masking rules.
6. `dedupe`: reject already-seen `eventId`.
7. `enqueue`: durable spool queue.
8. `write`: async writers to ClickHouse and PostgreSQL.
9. `emit`: internal collector metrics and logs.

Threading model:

1. Ingress workers are lightweight and non-blocking.
2. Write workers are bounded by configurable concurrency.
3. Queue depth, retry count, and DLQ size are exposed as metrics.

## 5.4 Idempotency and Event IDs

Rules:

1. OTEL events: `eventId = sha256(source + sessionId + promptId + timestamp + semanticKey)`.
2. Hook events: if Claude provides an ID, use it; else deterministic hash of payload signature.
3. Transcript events: `eventId = sha256(sessionId + lineNumber + lineHash)`.
4. Git enrichment events: `eventId = sha256(sessionId + commitSha + eventType)`.

Storage constraints:

1. ClickHouse: `ReplacingMergeTree` with `(event_id)` collapse semantics or dedupe view.
2. PostgreSQL: `UNIQUE(event_id)` staging table for dedupe bookkeeping.

## 5.5 Session Reconstruction Algorithm

Input sets:

1. Raw events from ClickHouse by `session_id`.
2. Session metadata from PostgreSQL.
3. Optional git commits linked by session.

Ordering strategy:

1. Primary sort: `event_timestamp`.
2. Secondary tie-breaker: source priority (`hook`, `otel`, `transcript`, `git`).
3. Tertiary tie-breaker: source sequence (`lineNumber`, `spanId`, or hash order).

Grouping:

1. Bucket by `prompt_id` where available.
2. For missing `prompt_id`, attach to nearest prior prompt window by time threshold.

Output:

1. Ordered `timeline[]`.
2. Aggregated metrics.
3. Gaps/ambiguities annotated for UI.

## 5.6 Database Design

### 5.6.1 ClickHouse tables

`agent_events` (append + dedupe-aware):

1. Event identity: `event_id`, `source`, `event_type`.
2. Correlation: `session_id`, `prompt_id`, user/org.
3. Cost/tokens: model, cost, token fields.
4. Tool fields: tool name/success/duration.
5. Git fields: commit metadata and diff stats.
6. Flexible `attributes` map.

`session_traces` (pre-aggregated):

1. One record per session version.
2. Aggregate counts, costs, token totals, models/tools used.
3. Rebuilt on session end and on recalculation jobs.

Materialized views:

1. `daily_user_metrics`
2. `tool_usage_daily`
3. `model_cost_daily`

### 5.6.2 PostgreSQL tables

`users`

1. `id`, `email`, `device_id`, `api_key_hash`, timestamps.

`sessions`

1. `session_id`, `user_id`, start/end/status, repo/branch/project_path.

`commits`

1. `sha`, `session_id`, `prompt_id`, message, diff stats, chain cost.

`instance_settings`

1. key/value settings for privacy tier, retention, feature flags.

`ingestion_dedupe`

1. `event_id`, `seen_at`, `source`, optional checksum.

## 5.7 API Design (`@agent-trace/api`)

### 5.7.1 REST endpoints (v0.1)

1. `GET /health`
2. `GET /v1/sessions`
3. `GET /v1/sessions/:sessionId`
4. `GET /v1/sessions/:sessionId/timeline`
5. `GET /v1/analytics/cost?from=&to=&groupBy=user|model|project`
6. `GET /v1/analytics/tools?from=&to=`

### 5.7.2 SSE endpoints

1. `GET /v1/live/sessions` for active session updates.

### 5.7.3 API behavior constraints

1. Cursor-based pagination for all list endpoints.
2. Default query windows to prevent unbounded scans.
3. Explicit API versioning in route prefix.

## 5.8 CLI Design (`@agent-trace/cli`)

Commands:

1. `agent-trace init`
   - Detect Claude config path.
   - Add hook commands and endpoint URL.
   - Set privacy tier and env defaults.
2. `agent-trace hook-handler`
   - Read JSON from `stdin`.
   - Add local git context (repo, branch, head SHA).
   - POST to collector `/v1/hooks`.
3. `agent-trace status`
   - Validate collector/api reachability.
   - Validate Claude hook wiring.
   - Print privacy tier and config summary.

Failure behavior:

1. Hook handler should fail open by default (do not break coding flow).
2. Optional strict mode for CI-like environments.

## 5.9 Dashboard Design (`@agent-trace/dashboard`)

Pages:

1. `/sessions`
   - Table: session, user, repo, duration, cost, prompts, commits.
   - Filters: date range, repo, user, cost range.
2. `/sessions/:id`
   - Prompt-grouped timeline.
   - Cost waterfall and token sparkline.
   - Tool and commit events with status markers.
3. `/cost`
   - Daily/weekly/monthly charts.
   - Group by user/model/project.

Data access:

1. SWR polling for near-real-time dashboard cards.
2. SSE for active session timeline updates.

## 5.10 Privacy and Redaction Internals

Redaction pipeline (collector):

1. Detect configured tier.
2. Drop non-allowed fields by tier.
3. Apply regex and dictionary-based masking.
4. Mark event with `redactionApplied = true|false`.
5. Store original payload only when policy permits.

Test requirements:

1. Unit tests for representative secret patterns.
2. Golden tests per privacy tier.
3. Contract tests to ensure no restricted fields leak into storage.

## 5.11 Observability of agent-trace itself

Emit internal telemetry:

1. Ingestion QPS, success/failure counts.
2. Queue depth, retry attempts, DLQ size.
3. Writer latency p50/p95/p99.
4. Session reconstruction latency.

Expose:

1. `/metrics` (Prometheus format) for local monitoring.
2. Structured logs with correlation IDs.

## 5.12 Performance Targets

Initial targets for a single-node dev instance:

1. Sustained ingest: 200 events/s.
2. Hook request ack: p95 <= 150ms.
3. Session trace query: p95 <= 800ms for 10k-event sessions.
4. Dashboard initial load: <= 2s on local network.

## 5.13 Data Lifecycle and Retention

Defaults:

1. Raw events retention: 30 days.
2. Aggregates retention: 365 days.
3. Metadata tables retention: 365 days.

Controls:

1. TTL policies in ClickHouse tables.
2. Scheduled PostgreSQL cleanup jobs.
3. Configurable in `instance_settings`.

## 5.14 Testing Strategy

1. Unit tests
   - Schema validation, redaction, event ID generation.
2. Integration tests
   - Collector to ClickHouse/PostgreSQL writes with retry and dedupe.
3. End-to-end tests
   - Simulated Claude session to dashboard replay verification.
4. Contract tests
   - Compatibility across schema version updates.

## 5.15 Risks and Mitigations

Risk: Claude event format changes.  
Mitigation: explicit source-version mapping + compatibility adapters.

Risk: Duplicate/out-of-order events.  
Mitigation: deterministic IDs, tie-break ordering, dedupe tables.

Risk: Privacy leakage.  
Mitigation: deny-by-default tier policy and redaction tests in CI.

Risk: Storage failure during active sessions.  
Mitigation: durable spool + DLQ + replay command.

---

## 6) Execution Backlog (Implementation-Ready)

## P0 (must-have for MVP)

1. Repo scaffold and workspace tooling.
2. Shared schema package and validators.
3. Base migrations for ClickHouse/PostgreSQL.
4. Collector ingress + spool + writers.
5. CLI `hook-handler` and `init`.
6. API endpoints for sessions and cost.
7. Dashboard session list and replay.
8. Docker compose stack and health checks.

## P1 (immediately after MVP)

1. Transcript parser hardening and backfill tool.
2. Advanced replay (diff panels, richer annotations).
3. Prompt effectiveness scoring job.
4. PR outcome tracking.

## P2

1. Team analytics.
2. RBAC/SSO/audit features.
3. Multi-agent adapter architecture.

---

## 7) Definition of Done (v0.1)

1. `docker compose up` starts full stack on clean machine.
2. `agent-trace init` configures Claude hooks in under 60 seconds.
3. Real session appears in `/sessions` with cost + token + tool metrics.
4. Session replay shows prompt-grouped timeline and linked commits.
5. Privacy Tier 1 stores no prompt text or code content.
6. Retry/dedupe behavior verified by integration tests.

