#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="$ROOT_DIR/docker/docker-compose.yml"
DEV_COMPOSE_FILE="$ROOT_DIR/docker/docker-compose.dev.yml"
MODE="${1:-prod}"

if [[ "$MODE" == "dev" ]]; then
  docker compose -f "$COMPOSE_FILE" -f "$DEV_COMPOSE_FILE" down --remove-orphans
else
  docker compose -f "$COMPOSE_FILE" down --remove-orphans
fi

echo "agent-trace stack stopped (mode=$MODE)"
