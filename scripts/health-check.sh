#!/usr/bin/env bash
set -euo pipefail

function check_health() {
  local name="$1"
  local url="$2"
  local service_field="$3"

  local body
  if ! body="$(curl -fsS "$url")"; then
    echo "FAIL: $name health endpoint unreachable ($url)"
    return 1
  fi

  if [[ "$body" != *"\"status\":\"ok\""* ]] || [[ "$body" != *"\"service\":\"$service_field\""* ]]; then
    echo "FAIL: $name returned unexpected payload: $body"
    return 1
  fi

  echo "OK: $name ($url)"
}

check_health "collector" "http://127.0.0.1:8317/health" "collector"
check_health "api" "http://127.0.0.1:8318/health" "api"
check_health "dashboard" "http://127.0.0.1:3100/health" "dashboard"

echo "all core services healthy"
