#!/usr/bin/env bash
# verify-db.sh — CI-safe DB-backed local smoke verification.
#
# Starts a fresh local Supabase stack (or reuses one that is already running),
# resets the database to a clean migrated state, bootstraps a smoke quiz,
# starts the Vite/Worker dev server, and runs the full smoke test suite against
# the local stack.  No backup/restore is performed; the DB is treated as
# disposable (as it is in CI and in act containers).
#
# Environment variables (all optional):
#   SMOKE_BASE_URL         — base URL for the local dev server (default: http://127.0.0.1:4173)
#   APP_TOKEN_SECRET       — Worker secret used to sign admin tokens; defaults to a
#                            CI-only placeholder when .dev.vars is not present

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

SMOKE_BASE_URL="${SMOKE_BASE_URL:-http://127.0.0.1:4173}"
DEV_SERVER_LOG="/tmp/mrkwiz-verify-dev.log"
DEV_SERVER_PID=""
DEV_SERVER_PGID=""
SUPABASE_STARTED=0
GENERATED_DEV_VARS=0

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

log() {
    printf "\n[verify-db] %s\n" "$1"
}

require_command() {
    if ! command -v "$1" >/dev/null 2>&1; then
        echo "Missing required command: $1" >&2
        exit 1
    fi
}

is_db_ready() {
    npx supabase db query --local "select 1;" >/dev/null 2>&1
}

is_server_ready() {
    # Probe an API route that is handled by the worker (returns 4xx, never touches
    # the ASSETS binding). We accept any HTTP response — a 404 "not found" is fine.
    local code
    code="$(curl --silent --max-time 2 -o /dev/null -w '%{http_code}' \
        "${SMOKE_BASE_URL}/api/respondent/invite/probe" 2>/dev/null)"
    [[ "$code" =~ ^[2-5][0-9][0-9]$ ]]
}

stop_dev_server() {
    # Kill the entire process group to clean up npm's children (vite, esbuild, workerd).
    if [[ -n "$DEV_SERVER_PGID" ]]; then
        log "Stopping local dev server (pgid ${DEV_SERVER_PGID})"
        kill -- "-${DEV_SERVER_PGID}" >/dev/null 2>&1 || true
        # Wait for the process group leader if still tracked.
        if [[ -n "$DEV_SERVER_PID" ]]; then
            wait "$DEV_SERVER_PID" >/dev/null 2>&1 || true
        fi
    fi
    DEV_SERVER_PID=""
    DEV_SERVER_PGID=""
}

kill_port() {
    local port="$1"
    if command -v fuser >/dev/null 2>&1; then
        fuser -k "${port}/tcp" >/dev/null 2>&1 || true
    elif command -v lsof >/dev/null 2>&1; then
        lsof -ti "tcp:${port}" | xargs -r kill -9 >/dev/null 2>&1 || true
    fi
}

on_exit() {
    stop_dev_server

    if [[ "$SUPABASE_STARTED" -eq 1 ]]; then
        log "Stopping Supabase stack (started by this script)"
        npm run supabase:stop >/dev/null 2>&1 || true
    fi

    if [[ "$GENERATED_DEV_VARS" -eq 1 && -f "$ROOT_DIR/.dev.vars" ]]; then
        log "Removing generated .dev.vars"
        rm -f "$ROOT_DIR/.dev.vars"
    fi
}

trap 'on_exit' EXIT

# ---------------------------------------------------------------------------
# Pre-flight checks
# ---------------------------------------------------------------------------

require_command npm
require_command npx
require_command curl

# ---------------------------------------------------------------------------
# Start Supabase if not already running
# ---------------------------------------------------------------------------

if ! is_db_ready; then
    log "Starting local Supabase stack"
    npm run supabase:start
    SUPABASE_STARTED=1
fi

# ---------------------------------------------------------------------------
# Resolve Worker credentials, generating .dev.vars when absent (CI path)
# ---------------------------------------------------------------------------

if [[ ! -f "$ROOT_DIR/.dev.vars" ]]; then
    if [[ -n "${SUPABASE_URL:-}" && -n "${SUPABASE_SERVICE_ROLE_KEY:-}" ]]; then
        # Credentials already injected via environment (act --env-file or CI secrets).
        log "No .dev.vars found — writing from environment variables"
        cat > "$ROOT_DIR/.dev.vars" <<EOF
SUPABASE_URL=${SUPABASE_URL}
SUPABASE_SERVICE_ROLE_KEY=${SUPABASE_SERVICE_ROLE_KEY}
APP_TOKEN_SECRET=${APP_TOKEN_SECRET:-ci-test-secret-local-only}
EOF
        GENERATED_DEV_VARS=1
    else
        # Fall back to parsing 'supabase status' (CI path after 'supabase start').
        log "No .dev.vars found — generating from local Supabase status"

        status_output=""
        status_exit=0
        status_output="$(npx supabase status 2>&1)" || status_exit=$?

        if [[ "$status_exit" -ne 0 ]]; then
            echo "ERROR: 'supabase status' failed (exit code ${status_exit})." >&2
            echo "Output was:" >&2
            echo "$status_output" >&2
            echo "" >&2
            echo "Hint: set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY as environment variables," >&2
            echo "      or create .dev.vars before running this script." >&2
            exit 1
        fi

        local_api_url="$(
            echo "$status_output" \
            | grep -E '^\s+API URL:' \
            | sed 's/.*API URL:[[:space:]]*//' \
            | tr -d '[:space:]'
        )"

        local_service_role_key="$(
            echo "$status_output" \
            | grep -E '^\s+service_role key:' \
            | sed 's/.*service_role key:[[:space:]]*//' \
            | tr -d '[:space:]'
        )"

        if [[ -z "$local_api_url" || -z "$local_service_role_key" ]]; then
            echo "ERROR: Could not parse local Supabase credentials from 'supabase status'." >&2
            echo "Output was:" >&2
            echo "$status_output" >&2
            exit 1
        fi

        cat > "$ROOT_DIR/.dev.vars" <<EOF
SUPABASE_URL=${local_api_url}
SUPABASE_SERVICE_ROLE_KEY=${local_service_role_key}
APP_TOKEN_SECRET=${APP_TOKEN_SECRET:-ci-test-secret-local-only}
EOF
        GENERATED_DEV_VARS=1
    fi
fi

# ---------------------------------------------------------------------------
# Reset the database to a clean, fully migrated state
# ---------------------------------------------------------------------------

log "Resetting local database"
npm run supabase:db:reset

# ---------------------------------------------------------------------------
# Bootstrap a smoke quiz and capture the context JSON
# ---------------------------------------------------------------------------

log "Bootstrapping smoke quiz"
smoke_context_json="$(
    SMOKE_RUN_TAG="verify-db-$(date +%Y%m%d-%H%M%S)" \
    npx tsx ./scripts/bootstrap-smoke-quiz.ts
)"

extract_json_field() {
    node -e "const v = JSON.parse(process.argv[1]); process.stdout.write(v['$1'] ?? '');" \
         "$smoke_context_json"
}

smoke_admin_key="$(extract_json_field adminKey)"
smoke_quiz_id="$(extract_json_field quizId)"
smoke_supabase_url="$(extract_json_field supabaseUrl)"
smoke_service_role_key="$(extract_json_field supabaseServiceRoleKey)"

if [[ -z "$smoke_admin_key" || -z "$smoke_quiz_id" || -z "$smoke_supabase_url" || -z "$smoke_service_role_key" ]]; then
    echo "ERROR: Failed to bootstrap smoke quiz — missing fields in context JSON." >&2
    echo "Context JSON: $smoke_context_json" >&2
    exit 1
fi

# ---------------------------------------------------------------------------
# Start the local Vite/Worker dev server
# ---------------------------------------------------------------------------

log "Starting local dev server at ${SMOKE_BASE_URL}"
# Free the port if a leftover process from a previous run is still bound to it.
kill_port 4173
sleep 1
# Use --strictPort so Vite fails fast rather than silently incrementing the port.
# Use --no-open to suppress xdg-open in headless environments.
# Run in a new process group so stop_dev_server can kill the whole tree.
set -m
npm run dev -- --host 127.0.0.1 --port 4173 --strictPort --no-open >"$DEV_SERVER_LOG" 2>&1 &
DEV_SERVER_PID="$!"
set +m
DEV_SERVER_PGID="$(ps -o pgid= -p "$DEV_SERVER_PID" 2>/dev/null | tr -d ' ')" || DEV_SERVER_PGID=""

log "Waiting for dev server to become ready"
attempts=0
until is_server_ready; do
    attempts=$((attempts + 1))
    if [[ "$attempts" -gt 60 ]]; then
        echo "ERROR: Timed out waiting for dev server at ${SMOKE_BASE_URL}" >&2
        echo "Server log (${DEV_SERVER_LOG}):" >&2
        cat "$DEV_SERVER_LOG" >&2 || true
        exit 1
    fi
    sleep 1
done

# ---------------------------------------------------------------------------
# Run smoke tests against the local stack
# ---------------------------------------------------------------------------

log "Running smoke tests against local stack"
SMOKE_BASE_URL="$SMOKE_BASE_URL" \
SMOKE_ADMIN_KEY="$smoke_admin_key" \
SMOKE_SUPABASE_URL="$smoke_supabase_url" \
SMOKE_SUPABASE_SERVICE_ROLE_KEY="$smoke_service_role_key" \
SMOKE_QUIZ_ID="$smoke_quiz_id" \
SMOKE_CLEANUP_OWNED_QUIZ="1" \
npm run test:smoke:api

log "DB verification complete"
