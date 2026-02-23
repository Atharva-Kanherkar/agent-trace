# agent-trace

Self-hosted observability for agentic coding workflows.

`agent-trace` helps developers and teams answer:

1. What exactly did my coding agent do?
2. How much did that session cost in tokens and dollars?
3. Did that work produce useful outcomes (commits, PR progress, fewer failures)?

This project starts with **Claude Code** and is designed to expand to other agents later.

## Current Status

Project stage: **planning + architecture setup**  
Code status: **scaffolded repository, implementation not started**

Detailed architecture (HLD + LLD): `docs/ARCHITECTURE_HLD_LLD.md`

## Problem Statement

Agentic coding tools are becoming a major engineering cost center, but observability is weak:

1. Teams cannot replay exactly what happened during a session.
2. Cost spikes are hard to explain.
3. Prompt quality and developer effectiveness are difficult to measure.
4. Existing tools are often cloud-first or proxy-based, with privacy and deployment friction.

`agent-trace` exists to provide **local-first, self-hosted observability** for coding agent workflows.

## Product Vision

Build the default open observability layer for agentic coding:

1. Works with local developer workflows.
2. Preserves privacy by default.
3. Makes session behavior understandable, auditable, and optimizable.
4. Produces actionable analytics (cost, reliability, productivity).

## Scope (v0.1)

### In scope

1. Claude Code telemetry ingestion from three layers:
   - OTEL stream
   - Hook events
   - Transcript parsing on session end
2. Session timeline reconstruction (prompt-grouped replay).
3. Cost and token analytics by user/model/project.
4. Git linkage (session -> commit provenance).
5. Self-hosted deployment via Docker Compose.
6. CLI for setup and hook forwarding.

### Out of scope (v0.1)

1. Multi-agent adapters (Cursor/Copilot/etc).
2. Full enterprise auth features (SSO/SAML/RBAC).
3. ML-assisted recommendations.

## High-Level Architecture

```text
Claude Code
  |- Layer 1 OTEL --------------------------> Collector (OTLP gRPC :4717)
  |- Layer 2 Hook JSON ---------------------> Collector (HTTP :8317)
  '- Layer 3 Transcript JSONL (SessionEnd) -> Collector parser

Collector
  |- Normalize + validate + redact
  |- Enrich with git/session metadata
  |- Deduplicate + durable queue
  |- Async writes to ClickHouse + PostgreSQL

API (REST + SSE :8318)
  |- Sessions
  |- Timeline replay data
  '- Analytics endpoints

Dashboard (Next.js :3100)
  |- Session list
  |- Session replay
  '- Cost analytics
```

## Technology Plan

1. Language: TypeScript (Node.js)
2. UI: Next.js dashboard
3. Analytics store: ClickHouse
4. Relational store: PostgreSQL
5. Packaging: pnpm workspace monorepo
6. Deployment: Docker Compose

## Repository Plan

```text
agent-trace/
  docker/                  # compose files
  docs/                    # architecture and design docs
  migrations/              # clickhouse + postgres SQL migrations
  packages/
    schema/                # shared contracts and validators
    collector/             # ingestion + enrichment + writers
    api/                   # REST + SSE query service
    dashboard/             # web UI
    cli/                   # init, hook-handler, status
```

## Privacy-First Plan

`agent-trace` follows explicit privacy tiers.

1. Tier 1 (default): metadata only (cost/tokens/timing/tool names).
2. Tier 2 (opt-in): prompt text and tool params.
3. Tier 3 (opt-in): full fidelity including content.

Guardrails:

1. Redaction on collector ingress.
2. Tier-based field dropping before write.
3. No outbound telemetry by default.

## Reliability Plan

Core rule: telemetry collection must never break coding flow.

1. Fast ingest acknowledgement.
2. Durable local spool queue on storage failure.
3. Retry with exponential backoff.
4. Dead-letter queue for manual replay.
5. Idempotent event IDs to prevent double counting.

## Simple Future Plan (Roadmap)

### Phase 0: Foundations

1. Monorepo tooling and package boundaries.
2. Shared event contracts and schema versioning.
3. Base database migrations.

### Phase 1: Ingestion MVP

1. Collector OTEL + hook ingestion.
2. Basic transcript parsing path.
3. ClickHouse/PostgreSQL writer pipeline.
4. Deduplication and retry logic.

### Phase 2: Product MVP

1. API endpoints for sessions/timeline/analytics.
2. Dashboard session list + replay + cost views.
3. CLI `init`, `hook-handler`, `status`.
4. End-to-end local deployment with Docker Compose.

### Phase 3: Hardening

1. Privacy conformance tests.
2. Replay correctness tests.
3. Performance and storage tuning.
4. Backfill and reprocessing tooling.

### Phase 4: Post-MVP Expansion

1. Prompt effectiveness scoring.
2. PR outcome tracking and revert detection.
3. Team analytics.
4. Multi-agent adapter architecture.

## Detailed Execution Plan (Implementation Order)

1. `@agent-trace/schema`
   - Event envelope types
   - Session trace DTOs
   - Validation schemas
2. Migrations
   - ClickHouse `agent_events`, `session_traces`, materialized views
   - PostgreSQL `users`, `sessions`, `commits`, `settings`, dedupe tables
3. `@agent-trace/collector`
   - OTLP + HTTP receivers
   - normalization/enrichment/redaction pipeline
   - spool/retry/dead-letter behavior
4. `@agent-trace/cli`
   - Claude hook setup (`init`)
   - Hook forwarder (`hook-handler`)
   - diagnostics (`status`)
5. `@agent-trace/api`
   - session list/details/timeline
   - analytics endpoints
   - SSE updates for active sessions
6. `@agent-trace/dashboard`
   - session table with filters
   - replay timeline
   - cost and model breakdown charts
7. Compose and operational docs
   - one-command local stack
   - health checks
   - troubleshooting

## MVP Definition of Done

v0.1 is done when:

1. `docker compose up` boots full local stack.
2. `agent-trace init` wires Claude hooks in under one minute.
3. A real coding session is visible in dashboard with timeline and cost metrics.
4. Commits are linked to sessions.
5. Privacy Tier 1 stores no prompt/code content.
6. Retry + dedupe behavior passes integration tests.

## Success Metrics

1. Ingestion success >= 99.5%.
2. Event-to-UI latency p95 <= 5 seconds.
3. Replay completeness >= 98% of ingested events linked correctly.
4. No privacy policy regressions in CI tests.

## Open-Core Plan

### Apache 2.0 (core)

1. Collector, API, dashboard, CLI
2. Core schemas/migrations
3. Session replay and cost analytics
4. Self-hosted Docker deployment

### BSL 1.1 (enterprise)

1. RBAC/SSO/audit/retention automation
2. Advanced org analytics and alerting
3. Advanced scoring and bulk export

## Contribution Plan

Planned contribution workflow:

1. Keep architecture changes documented in `docs/`.
2. Add tests with every functional feature.
3. Preserve schema version compatibility.
4. Require privacy impact notes for telemetry field changes.

## Next Immediate Steps

1. Bootstrap pnpm workspace and package manifests.
2. Add migration SQL skeletons.
3. Implement minimal collector with health endpoint.
4. Add local compose stack and run first end-to-end ingest test.

