#!/usr/bin/env bash
# Derive stable, distinct database/HTTP settings from the worktree path, so one
# shared .env (identical in every worktree) works everywhere. Writes no files.
#   --dry-run     print the three values after checking for collisions
#   --get NAME    print one value (used by Taskfile env; no collision check)
set -euo pipefail

usage() { printf 'Usage: task setup or task setup:preview\n' >&2; exit 2; }
case $# in
  0) mode=setup ;;
  1) [[ $1 == --dry-run ]] || usage; mode=preview ;;
  2) [[ $1 == --get && $2 =~ ^(WORKTREE_DB|API_ADDR|FRONTEND_PORT)$ ]] || usage; mode=get ;;
  *) usage ;;
esac

die() { printf '%s\n' "$*" >&2; exit 1; }
root=$(git rev-parse --show-toplevel) || die 'Run this from a Git worktree.'
cd "$root"

identity() {
  local path=$1 canonical digest
  canonical=$(git -C "$path" rev-parse --show-toplevel) || die "Unavailable worktree: $path"
  digest=$(printf '%s' "${canonical,,}" | sha256sum)
  printf '%s' "${digest%% *}"
}

hash=$(identity "$root")
db="ecommerce_w${hash:0:12}"
api_port=$((18000 + 16#${hash:0:4} % 1000))
frontend_port=$((19000 + 16#${hash:4:4} % 1000))

if [[ $mode == get ]]; then
  case $2 in
    WORKTREE_DB) printf '%s\n' "$db" ;;
    API_ADDR) printf '127.0.0.1:%s\n' "$api_port" ;;
    FRONTEND_PORT) printf '%s\n' "$frontend_port" ;;
  esac
  exit 0
fi

# Fail instead of silently assigning a port already allocated to a registered worktree.
while IFS= read -r -d '' record; do
  [[ $record == worktree\ * ]] || continue
  path=${record#worktree }
  [[ -d $path ]] || die "Stale worktree registration: $path (inspect git worktree list and remove the stale registration before setup)."
  other_hash=$(identity "$path")
  [[ $other_hash == "$hash" ]] && continue
  other_api=$((18000 + 16#${other_hash:0:4} % 1000))
  other_frontend=$((19000 + 16#${other_hash:4:4} % 1000))
  if [[ $other_api -eq $api_port || $other_frontend -eq $frontend_port || ${other_hash:0:12} == ${hash:0:12} ]]; then
    die "Worktree allocation collision with $path. Use a different worktree path; manual port overrides are not supported."
  fi
done < <(git worktree list --porcelain -z)

printf 'WORKTREE_DB=%s\nAPI_ADDR=127.0.0.1:%s\nFRONTEND_PORT=%s\n' "$db" "$api_port" "$frontend_port"
[[ $mode == preview ]] && exit 0

[[ -f .env ]] || die 'Missing local .env. Copy the shared .env from the primary worktree (Orca copies it through .worktreeinclude).'
[[ -n ${POSTGRES_USER:-} && -n ${POSTGRES_PASSWORD:-} && -n ${POSTGRES_DB:-} ]] || die 'POSTGRES_USER, POSTGRES_PASSWORD, and POSTGRES_DB are required in the local .env.'
# Taskfile derives these three values; a different value means a shell override.
[[ ${WORKTREE_DB:-} == "$db" && ${API_ADDR:-} == "127.0.0.1:$api_port" && ${FRONTEND_PORT:-} == "$frontend_port" ]] || die 'WORKTREE_DB, API_ADDR, or FRONTEND_PORT is overridden in the shell; unset them so Taskfile derives them.'

# Keep POSTGRES_DB and POSTGRES_PORT identical across worktrees: these identify
# the ONE shared Compose container; WORKTREE_DB is the isolated database.
[[ $(docker compose ps --status running --services postgres) == postgres ]] || die 'Shared PostgreSQL is not running. Run task dev:db:up from the primary worktree.'

# Session-level lock makes concurrent invocations idempotent. psql quotes the
# database identifier; no untrusted path or branch name enters SQL directly.
docker compose exec -T postgres psql -X -q -U "$POSTGRES_USER" -d postgres \
  -v ON_ERROR_STOP=1 -v "worktree_db=$db" <<'SQL'
SELECT pg_advisory_lock(hashtext(:'worktree_db'));
SELECT format('CREATE DATABASE %I', :'worktree_db')
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = :'worktree_db') \gexec
SELECT pg_advisory_unlock(hashtext(:'worktree_db'));
SQL
printf 'Worktree database ready: %s\n' "$db"
