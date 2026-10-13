#!/usr/bin/env bash
# Public Taskfile smoke test; safe without Docker or a local .env.
set -euo pipefail

TASK_BIN=${TASK_BIN:-task}
err_file=tests/.setup-test.stderr
trap 'rm -f "$err_file"' EXIT
first=$("$TASK_BIN" setup:preview 2>"$err_file") || {
  printf 'task setup:preview failed:\n' >&2
  while IFS= read -r line; do printf '%s\n' "$line" >&2; done < "$err_file"
  exit 1
}
second=$("$TASK_BIN" setup:preview 2>"$err_file")
if [[ -s "$err_file" ]]; then
  printf 'unexpected stderr from task setup:preview\n' >&2
  exit 1
fi

[[ "$first" == "$second" ]] || { printf 'worktree configuration changed between calls\n' >&2; exit 1; }
mapfile -t lines <<< "$first"
[[ ${#lines[@]} -eq 3 && ${lines[0]} =~ ^WORKTREE_DB=ecommerce_w[0-9a-f]{12}$ && ${lines[1]} =~ ^API_ADDR=127\.0\.0\.1:18[0-9]{3}$ && ${lines[2]} =~ ^FRONTEND_PORT=19[0-9]{3}$ ]] || {
  printf 'unexpected worktree configuration: %s\n' "$first" >&2
  exit 1
}
printf 'task setup dry-run passed\n'
