#!/usr/bin/env bash
set -euo pipefail

RETRIES="${HEALTH_CHECK_RETRIES:-30}"
SLEEP_SECONDS="${HEALTH_CHECK_SLEEP_SECONDS:-2}"

function check_health() {
  local name="$1"
  local url="$2"
  local service_field="$3"

  local attempt=1
  local body=""
  while [[ "$attempt" -le "$RETRIES" ]]; do
    if body="$(curl -fsS "$url" 2>/dev/null)" \
      && [[ "$body" == *"\"status\":\"ok\""* ]] \
      && [[ "$body" == *"\"service\":\"$service_field\""* ]]; then
      echo "OK: $name ($url)"
      return 0
    fi

    if [[ "$attempt" -eq "$RETRIES" ]]; then
      break
    fi

    echo "WAIT: $name not healthy yet (attempt $attempt/$RETRIES)"
    sleep "$SLEEP_SECONDS"
    attempt=$((attempt + 1))
  done

  if [[ -z "$body" ]]; then
    echo "FAIL: $name health endpoint unreachable ($url)"
  else
    echo "FAIL: $name returned unexpected payload: $body"
  fi
  return 1
}

check_health "collector" "http://127.0.0.1:8317/health" "collector"
check_health "api" "http://127.0.0.1:8318/health" "api"
check_health "dashboard" "http://127.0.0.1:3100/health" "dashboard"

echo "all core services healthy"
