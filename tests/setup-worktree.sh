#!/usr/bin/env bash
# Public Taskfile smoke test; safe without Docker or a local .env.
set -euo pipefail

TASK_BIN=${TASK_BIN:-task}
err_file=$(mktemp)
scratch=$(mktemp -d)
cleanup() {
  rm -f "$err_file"
  git worktree remove --force "$scratch/wt" >/dev/null 2>&1 || true
  rm -rf "$scratch"
}
trap cleanup EXIT

fail() { printf '%s\n' "$*" >&2; exit 1; }

preview() {
  "$TASK_BIN" --dir "$1" setup:preview 2>"$err_file" || {
    printf 'task setup:preview failed in %s:\n' "$1" >&2
    while IFS= read -r line; do printf '%s\n' "$line" >&2; done < "$err_file"
    exit 1
  }
  [[ ! -s "$err_file" ]] || fail "unexpected stderr from task setup:preview in $1"
}

check_format() {
  local lines
  mapfile -t lines <<< "$1"
  [[ ${#lines[@]} -eq 3 && ${lines[0]} =~ ^WORKTREE_DB=ecommerce_w[0-9a-f]{12}$ && ${lines[1]} =~ ^API_ADDR=127\.0\.0\.1:18[0-9]{3}$ && ${lines[2]} =~ ^FRONTEND_PORT=19[0-9]{3}$ ]] ||
    fail "unexpected worktree configuration: $1"
}

root=$(git rev-parse --show-toplevel)

# 1. Stable values in this checkout.
first=$(preview "$root")
second=$(preview "$root")
[[ "$first" == "$second" ]] || fail 'worktree configuration changed between calls'
check_format "$first"

# 2. The values tasks see are derived from the worktree path, not read from .env:
#    a fresh worktree without any .env gets its own, different values.
git worktree add --quiet --detach "$scratch/wt" HEAD
# Test the checkout's current (possibly uncommitted) task wiring, not HEAD's.
cp "$root/Taskfile.yml" "$scratch/wt/Taskfile.yml"
cp "$root/scripts/setup-worktree.sh" "$scratch/wt/scripts/setup-worktree.sh"
other=$(preview "$scratch/wt")
check_format "$other"
[[ "$other" != "$first" ]] || fail 'a second worktree received the same database and ports'
mapfile -t a <<< "$first"
mapfile -t b <<< "$other"
for i in 0 1 2; do
  [[ "${a[$i]}" != "${b[$i]}" ]] || fail "a second worktree shares ${a[$i]}"
done

# 3. Without .env, task setup stops before Docker and names only the shared file.
if "$TASK_BIN" --dir "$scratch/wt" setup >/dev/null 2>"$err_file"; then
  fail 'task setup succeeded without a local .env'
fi
grep -q 'Missing local .env. Copy the shared .env from the primary worktree' "$err_file" ||
  fail "unexpected task setup error: $(cat "$err_file")"

printf 'task setup tests passed\n'
