#!/usr/bin/env bash
# Seed script: generates realistic multi-user data for testing the Team Dashboard.
# Usage: bash scripts/seed-team-data.sh [collector_url]

set -euo pipefail

URL="${1:-http://localhost:8317/v1/hooks}"
TOKEN="${2:-}"
AUTH_HEADER=""
if [ -n "$TOKEN" ]; then
  AUTH_HEADER="-H 'Authorization: Bearer $TOKEN'"
fi

EVT=0
post() {
  EVT=$((EVT + 1))
  curl -sf -X POST "$URL" -H 'Content-Type: application/json' -d "$1" > /dev/null
  printf "."
}

# --- Users ---
USERS=(
  "alice@acme.com|Alice Chen"
  "bob@acme.com|Bob Martinez"
  "carol@acme.com|Carol Johnson"
  "dave@acme.com|Dave Kim"
  "eve@acme.com|Eve Patel"
)

MODELS=("claude-sonnet-4-20250514" "claude-opus-4-20250514" "claude-haiku-4-5-20251001")
TOOLS=("Read" "Write" "Edit" "Bash" "Glob" "Grep" "WebSearch" "Agent")
REPOS=("acme/frontend" "acme/backend" "acme/infra" "acme/mobile-app")
BRANCHES=("main" "feat/auth" "fix/perf" "feat/dashboard" "refactor/api" "fix/login-bug" "feat/notifications" "chore/deps")

rand_range() {
  local min=$1 max=$2
  echo $(( RANDOM % (max - min + 1) + min ))
}

rand_cost() {
  local cents
  cents=$(rand_range 1 80)
  printf "0.%02d" "$cents"
}

big_cost() {
  local dollars cents
  dollars=$(rand_range 1 5)
  cents=$(rand_range 0 99)
  printf "%d.%02d" "$dollars" "$cents"
}

rand_element() {
  local arr=("$@")
  echo "${arr[RANDOM % ${#arr[@]}]}"
}

echo "=== Seeding team data to $URL ==="
echo ""

# Generate data for the last 14 days
for DAY_OFFSET in $(seq 13 -1 0); do
  DATE=$(date -u -d "-${DAY_OFFSET} days" +%Y-%m-%d 2>/dev/null || date -u -v-${DAY_OFFSET}d +%Y-%m-%d)
  echo ""
  echo "Day: $DATE"

  for USER_ENTRY in "${USERS[@]}"; do
    IFS='|' read -r EMAIL NAME <<< "$USER_ENTRY"

    # Each user has 1-4 sessions per day (some days 0 for some users)
    SKIP=$(rand_range 0 3)
    if [ "$SKIP" -eq 0 ] && [ "$DAY_OFFSET" -gt 2 ]; then
      continue  # skip this user on this day ~25% of the time
    fi

    NUM_SESSIONS=$(rand_range 1 4)

    for S in $(seq 1 "$NUM_SESSIONS"); do
      SESS_ID="sess_${EMAIL%%@*}_d${DAY_OFFSET}_s${S}"
      HOUR=$(rand_range 8 20)
      MINUTE=$(rand_range 0 59)
      SECOND=$(rand_range 0 59)
      TS="${DATE}T$(printf '%02d:%02d:%02d' $HOUR $MINUTE $SECOND).000Z"
      REPO=$(rand_element "${REPOS[@]}")
      BRANCH=$(rand_element "${BRANCHES[@]}")
      MODEL=$(rand_element "${MODELS[@]}")

      # --- 1. Session init event ---
      INIT_COST=$(rand_cost)
      IN_TOK=$(rand_range 2000 15000)
      OUT_TOK=$(rand_range 500 8000)
      post '{
        "schemaVersion": "1.0",
        "source": "hook",
        "eventId": "evt_'${EVT}'",
        "sessionId": "'"$SESS_ID"'",
        "eventType": "init",
        "eventTimestamp": "'"$TS"'",
        "ingestedAt": "'"$TS"'",
        "privacyTier": 3,
        "payload": {
          "user_email": "'"$EMAIL"'",
          "user_name": "'"$NAME"'",
          "model": "'"$MODEL"'",
          "cost_usd": '"$INIT_COST"',
          "input_tokens": '"$IN_TOK"',
          "output_tokens": '"$OUT_TOK"',
          "git_repo": "'"$REPO"'",
          "git_branch": "'"$BRANCH"'"
        }
      }'

      # --- 2. Tool call events (3-8 per session) ---
      NUM_TOOLS=$(rand_range 3 8)
      for T in $(seq 1 "$NUM_TOOLS"); do
        TOOL=$(rand_element "${TOOLS[@]}")
        TOOL_COST=$(rand_cost)
        T_IN=$(rand_range 500 5000)
        T_OUT=$(rand_range 200 3000)
        TOOL_MS=$(rand_range 50 5000)
        SUCCESS=$(rand_element "true" "true" "true" "false")  # 75% success
        T_SEC=$((SECOND + T))
        T_TS="${DATE}T$(printf '%02d:%02d:%02d' $HOUR $MINUTE $T_SEC).000Z"
        post '{
          "schemaVersion": "1.0",
          "source": "hook",
          "eventId": "evt_'${EVT}'",
          "sessionId": "'"$SESS_ID"'",
          "eventType": "tool_result",
          "eventTimestamp": "'"$T_TS"'",
          "ingestedAt": "'"$T_TS"'",
          "privacyTier": 3,
          "payload": {
            "user_email": "'"$EMAIL"'",
            "user_name": "'"$NAME"'",
            "model": "'"$MODEL"'",
            "cost_usd": '"$TOOL_COST"',
            "input_tokens": '"$T_IN"',
            "output_tokens": '"$T_OUT"',
            "toolName": "'"$TOOL"'",
            "toolSuccess": '"$SUCCESS"',
            "tool_duration_ms": '"$TOOL_MS"'
          }
        }'
      done

      # --- 3. Commit events (0-3 per session) ---
      NUM_COMMITS=$(rand_range 0 3)
      for C in $(seq 1 "$NUM_COMMITS"); do
        LINES_ADD=$(rand_range 5 500)
        LINES_REM=$(rand_range 0 200)
        SHA=$(printf '%040x' $((RANDOM * RANDOM * RANDOM)))
        C_SEC=$((SECOND + NUM_TOOLS + C))
        C_TS="${DATE}T$(printf '%02d:%02d:%02d' $HOUR $MINUTE $C_SEC).000Z"
        post '{
          "schemaVersion": "1.0",
          "source": "hook",
          "eventId": "evt_'${EVT}'",
          "sessionId": "'"$SESS_ID"'",
          "eventType": "commit",
          "eventTimestamp": "'"$C_TS"'",
          "ingestedAt": "'"$C_TS"'",
          "privacyTier": 3,
          "payload": {
            "user_email": "'"$EMAIL"'",
            "user_name": "'"$NAME"'",
            "commit_sha": "'"$SHA"'",
            "lines_added": '"$LINES_ADD"',
            "lines_removed": '"$LINES_REM"',
            "git_repo": "'"$REPO"'",
            "git_branch": "'"$BRANCH"'",
            "commit_message": "feat: update '"$BRANCH"' implementation"
          }
        }'
      done

      # --- 4. PR event (30% chance per session) ---
      PR_CHANCE=$(rand_range 1 10)
      if [ "$PR_CHANCE" -le 3 ]; then
        PR_NUM=$(rand_range 100 999)
        PR_SEC=$((SECOND + NUM_TOOLS + NUM_COMMITS + 1))
        PR_TS="${DATE}T$(printf '%02d:%02d:%02d' $HOUR $MINUTE $PR_SEC).000Z"
        post '{
          "schemaVersion": "1.0",
          "source": "hook",
          "eventId": "evt_'${EVT}'",
          "sessionId": "'"$SESS_ID"'",
          "eventType": "pull_request",
          "eventTimestamp": "'"$PR_TS"'",
          "ingestedAt": "'"$PR_TS"'",
          "privacyTier": 3,
          "payload": {
            "user_email": "'"$EMAIL"'",
            "user_name": "'"$NAME"'",
            "pr_url": "https://github.com/'"$REPO"'/pull/'"$PR_NUM"'",
            "pr_number": '"$PR_NUM"',
            "git_repo": "'"$REPO"'",
            "git_branch": "'"$BRANCH"'"
          }
        }'
      fi

      # --- 5. Session end event ---
      END_HOUR=$((HOUR + $(rand_range 0 2)))
      END_MIN=$(rand_range 0 59)
      END_TS="${DATE}T$(printf '%02d:%02d:%02d' $END_HOUR $END_MIN 0).000Z"
      FINAL_COST=$(big_cost)
      TOTAL_IN=$(rand_range 20000 150000)
      TOTAL_OUT=$(rand_range 5000 60000)
      post '{
        "schemaVersion": "1.0",
        "source": "hook",
        "eventId": "evt_'${EVT}'",
        "sessionId": "'"$SESS_ID"'",
        "eventType": "stop",
        "eventTimestamp": "'"$END_TS"'",
        "ingestedAt": "'"$END_TS"'",
        "privacyTier": 3,
        "payload": {
          "user_email": "'"$EMAIL"'",
          "user_name": "'"$NAME"'",
          "model": "'"$MODEL"'",
          "cost_usd": '"$FINAL_COST"',
          "input_tokens": '"$TOTAL_IN"',
          "output_tokens": '"$TOTAL_OUT"',
          "git_repo": "'"$REPO"'",
          "git_branch": "'"$BRANCH"'"
        }
      }'

    done
  done
done

echo ""
echo ""
echo "=== Done! Sent $EVT events for ${#USERS[@]} users over 14 days ==="
echo "Open http://localhost:3100 and check the Team tab."
