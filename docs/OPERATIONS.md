# agent-trace Operations

## Prerequisites

- Docker Engine with Compose plugin.
- Ports available on host: `3100`, `4717`, `8317`, `8318`, `5432`, `8123`, `9000`.

## Start

Production-like compose:

```bash
./scripts/start-stack.sh
```

Development compose (bind mounts + workspace rebuild in containers):

```bash
./scripts/start-stack.sh dev
```

## Verify

Health-check all core services:

```bash
./scripts/health-check.sh
```

Manual endpoint checks:

```bash
curl -s http://127.0.0.1:8317/health
curl -s http://127.0.0.1:8318/health
curl -s http://127.0.0.1:3100/health
```

## Logs

Production-like compose logs:

```bash
docker compose -f docker/docker-compose.yml logs -f
```

Development compose logs:

```bash
docker compose -f docker/docker-compose.yml -f docker/docker-compose.dev.yml logs -f
```

## Stop

Production-like compose:

```bash
./scripts/stop-stack.sh
```

Development compose:

```bash
./scripts/stop-stack.sh dev
```

## Service roles

- `collector` container uses `RUNTIME_SERVICE_ROLE=collector` (collector HTTP + OTEL ingest).
- `api` container uses `RUNTIME_SERVICE_ROLE=api` (API query service).
- Both services run DB-backed runtime mode and share ClickHouse/PostgreSQL.
