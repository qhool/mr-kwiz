#!/usr/bin/env bash
# run-verify-local.sh — run the full verify workflow locally via act.
#
# Requires act: https://github.com/nektos/act
#   Linux:  gh extension install nektos/gh-act  OR  brew install act
#   Or download from https://github.com/nektos/act/releases
#
# The .actrc in the repository root supplies the runner image and Docker socket
# options.  The DB-backed smoke step requires:
#   - Docker to be running on the host
#   - Either a local Supabase stack already running, or Docker access so the
#     script can start one (enabled via --container-daemon-socket in .actrc)
#
# Any extra arguments are forwarded to act (e.g. --job verify, --verbose).

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if command -v act >/dev/null 2>&1; then
    ACT_PREFIX=(act)
elif gh act --version >/dev/null 2>&1; then
    ACT_PREFIX=(gh act)
else
    cat >&2 <<'EOF'
Error: 'act' is not installed.

Install options:
  gh extension install nektos/gh-act   (then use as 'gh act')
  brew install act
  Download from https://github.com/nektos/act/releases
EOF
    exit 1
fi

# Pass local credentials into the act container so verify-db.sh does not need
# to run 'supabase status' (which is unreliable when Supabase is running on the
# host rather than inside the container).
act_args=(workflow_dispatch -W .github/workflows/verify.yml)
if [[ -f "$ROOT_DIR/.dev.vars" ]]; then
    act_args+=(--env-file "$ROOT_DIR/.dev.vars")
fi

exec "${ACT_PREFIX[@]}" "${act_args[@]}" "$@"
