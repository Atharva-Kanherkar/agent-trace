# agent-trace

Self-hosted observability for agentic coding workflows.

## Status

This repository has been reset and is being rebuilt from scratch with strict TypeScript.

Current implementation strategy:

1. Follow `docs/HLD_LLD.md` feature-by-feature.
2. Keep all package contracts in module-level `types.ts` files.
3. Enforce strict typing and maintainable boundaries.
4. Complete each feature with typecheck + unit tests + manual smoke validation.

## Source of truth

- `docs/HLD_LLD.md`
- `docs/STATUS_AND_NEXT_STEPS.md`

## Current feature set

Implemented modules:

1. `@agent-trace/schema`
2. `@agent-trace/collector`
3. `@agent-trace/api`
4. `@agent-trace/cli`
5. `@agent-trace/dashboard` (Next.js dashboard + core mappers/analytics)
6. `@agent-trace/platform` (migrations + validation)

## Validation

Run all quality gates:

```bash
npm run typecheck
npm run test:unit
npm run test:manual
```

## Docker compose (foundation)

Current compose stack (split services + storage):

1. ClickHouse (`8123`, `9000`)
2. PostgreSQL (`5432`)
3. Collector service (`8317`, OTEL gRPC on `4717`)
4. API service (`8318`)
5. Dashboard web server (`3100`)

Collector/API services are runtime-backed with role mode (`RUNTIME_SERVICE_ROLE=collector|api`). In DB-backed mode they apply ClickHouse and PostgreSQL migrations on startup before exposing endpoints.

Dashboard UI:

1. Dark mode by default.
2. Grafana-inspired visual language (cost trend panel, live session table, replay timeline).

Run:

```bash
docker compose -f docker/docker-compose.yml up --build
```

Dev override (bind-mount source):

```bash
docker compose -f docker/docker-compose.yml -f docker/docker-compose.dev.yml up --build
```

Helper scripts:

```bash
./scripts/start-stack.sh
./scripts/start-stack.sh dev
./scripts/health-check.sh
./scripts/stop-stack.sh
```

Detailed runbook: `docs/OPERATIONS.md`.
