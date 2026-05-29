#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

KEEP_BACKUP=0
NO_STOP=0
TEST_CMD="npm test"
STARTED_BY_SCRIPT=0
BACKUP_CREATED=0
BACKUP_FILE=""
BACKUP_DIR="$ROOT_DIR/.tmp/db-backups"
DB_CONTAINER_NAME=""

log() {
    printf "\n[%s] %s\n" "db-safe-test" "$1"
}

usage() {
    cat <<'EOF'
Usage: scripts/test-with-db-backup.sh [options]

Options:
  --test-cmd <command>  Command to run after reset (default: "npm test")
  --keep-backup          Keep backup file after restore
  --no-stop              Do not stop Supabase even if started by this script
  -h, --help             Show this help
EOF
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

resolve_db_container() {
    local expected_name="supabase_db_$(basename "$ROOT_DIR")"
    if docker ps --format '{{.Names}}' | grep -Fxq "$expected_name"; then
        DB_CONTAINER_NAME="$expected_name"
        return 0
    fi

    local discovered_name=""
    discovered_name="$(docker ps --format '{{.Names}}' | grep '^supabase_db_' | head -n 1 || true)"
    if [[ -n "$discovered_name" ]]; then
        DB_CONTAINER_NAME="$discovered_name"
        return 0
    fi

    echo "Could not find a running Supabase Postgres container (expected name: ${expected_name})" >&2
    return 1
}

restore_backup() {
    if [[ "$BACKUP_CREATED" -ne 1 || -z "$BACKUP_FILE" || ! -f "$BACKUP_FILE" ]]; then
        return 0
    fi

    log "Restoring local DB backup"
    npm run supabase:db:reset >/dev/null
    resolve_db_container
    docker exec -i "$DB_CONTAINER_NAME" pg_restore \
        --username=postgres \
        --dbname=postgres \
        --clean \
        --if-exists \
        --no-owner \
        --no-privileges \
        < "$BACKUP_FILE" >/dev/null
}

on_exit() {
    local exit_code="$1"
    local final_code="$exit_code"

    set +e

    restore_backup
    local restore_code=$?
    if [[ "$restore_code" -ne 0 && "$final_code" -eq 0 ]]; then
        final_code=1
    fi

    if [[ "$STARTED_BY_SCRIPT" -eq 1 && "$NO_STOP" -eq 0 ]]; then
        log "Stopping Supabase stack started by script"
        npm run supabase:stop >/dev/null 2>&1
    fi

    if [[ "$BACKUP_CREATED" -eq 1 && "$KEEP_BACKUP" -eq 0 && -f "$BACKUP_FILE" ]]; then
        rm -f "$BACKUP_FILE"
    fi

    trap - EXIT
    exit "$final_code"
}

while [[ $# -gt 0 ]]; do
    case "$1" in
        --test-cmd)
            TEST_CMD="${2:-}"
            shift 2
            ;;
        --keep-backup)
            KEEP_BACKUP=1
            shift
            ;;
        --no-stop)
            NO_STOP=1
            shift
            ;;
        -h|--help)
            usage
            exit 0
            ;;
        *)
            echo "Unknown option: $1" >&2
            usage
            exit 2
            ;;
    esac
 done

if [[ -z "$TEST_CMD" ]]; then
    echo "--test-cmd cannot be empty" >&2
    exit 2
fi

trap 'on_exit $?' EXIT

require_command npm
require_command npx
require_command docker

if ! is_db_ready; then
    log "Starting local Supabase stack"
    npm run supabase:start >/dev/null
    STARTED_BY_SCRIPT=1
fi

if ! is_db_ready; then
    echo "Local Supabase DB is not reachable via Supabase CLI local connection" >&2
    exit 1
fi

mkdir -p "$BACKUP_DIR"
BACKUP_FILE="$BACKUP_DIR/pre-test-$(date +%Y%m%d-%H%M%S).dump"

log "Creating backup at ${BACKUP_FILE}"
resolve_db_container
docker exec "$DB_CONTAINER_NAME" pg_dump \
    --username=postgres \
    --dbname=postgres \
    --format=custom \
    --clean \
    --if-exists \
    --no-owner \
    --no-privileges \
    --schema=public \
    > "$BACKUP_FILE"
BACKUP_CREATED=1

log "Resetting local DB (migrations + seed)"
npm run supabase:db:reset >/dev/null

log "Running test command: ${TEST_CMD}"
bash -lc "$TEST_CMD"

log "Test command finished successfully"
