# agent-trace HLD + LLD

Status: Active build spec
Updated: 2026-02-23

## 1. Product goal

Build a self-hosted observability platform for coding-agent sessions, starting with Claude Code, with strong privacy defaults and zero cloud dependency.

## 2. Architecture (HLD)

Data collection has three layers:

1. OTEL ingest (`:4717`)
2. Hook ingest (`:8317`)
3. Transcript parse on session end

Core services:

1. Collector
2. API
3. Dashboard
4. CLI
5. Shared schema package

Storage:

1. ClickHouse for event analytics
2. PostgreSQL for relational entities

## 3. LLD principles

1. Strict TypeScript across all packages.
2. No in-file ad-hoc interfaces for shared structures.
3. All domain contracts live in `types.ts` at module/package boundaries.
4. Validators and mapping functions must consume/export typed contracts.
5. Every feature slice includes:
   - Typecheck
   - Unit tests
   - Manual smoke test

## 4. Initial implementation order

1. `@agent-trace/schema`
2. `@agent-trace/collector`
3. `@agent-trace/api`
4. `@agent-trace/cli`
5. `@agent-trace/dashboard`
6. Docker and migrations

## 5. Feature 1 acceptance criteria (`schema`)

1. Strict event/session contracts in `packages/schema/src/types.ts`
2. Runtime validators with deterministic error output
3. No `any` usage
4. Unit tests for valid/invalid cases
5. Manual smoke script for quick contract verification

