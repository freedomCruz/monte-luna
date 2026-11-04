#!/usr/bin/env bash
set -euo pipefail

# Test suite for deploy/caddy/Caddyfile per odd/tasks/admin-etag-proxy-fix.md T1, S1, S2, S4.
#
# Caddy rewrites the ETag of every response it compresses, appending the encoding
# name ("3" becomes "3-gzip"). The admin API uses strong ETags for optimistic
# locking, so a compressed admin response makes the browser return an If-Match
# the API rejects with 400. These tests pin the scoped exclusion that fixes it
# and the compression that must survive it.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CADDYFILE="$SCRIPT_DIR/caddy/Caddyfile"

TESTS_RUN=0
TESTS_PASSED=0

pass() {
  TESTS_PASSED=$((TESTS_PASSED + 1))
  echo "  OK: $1"
}

fail() {
  echo "  FAIL: $1" >&2
  exit 1
}

check() {
  TESTS_RUN=$((TESTS_RUN + 1))
  local description="$1"
  shift
  if "$@"; then
    pass "$description"
  else
    fail "$description"
  fi
}

echo "=== Running deploy/test-caddy.sh ==="

if [[ ! -f "$CADDYFILE" ]]; then
  echo "FAIL: $CADDYFILE does not exist" >&2
  exit 1
fi

CONTENT="$(cat "$CADDYFILE")"

# The encode directive must carry a request matcher; a bare "encode zstd gzip"
# compresses the admin API and reintroduces the rewritten ETag.
encode_is_matched() {
  grep -Eq '^[[:space:]]*encode[[:space:]]+@[A-Za-z0-9_-]+[[:space:]]+' <<<"$CONTENT"
}
check "encode applies a named request matcher instead of matching every request" encode_is_matched

# The matcher must exclude the admin API, where ETags carry order and user versions.
matcher_excludes_admin_api() {
  local name
  name="$(grep -Eo '^[[:space:]]*encode[[:space:]]+@[A-Za-z0-9_-]+' <<<"$CONTENT" | grep -Eo '@[A-Za-z0-9_-]+' | head -1)"
  [[ -n "$name" ]] || return 1
  grep -Eq "^[[:space:]]*${name}[[:space:]]+not[[:space:]]+path[[:space:]]+/api/v1/admin/\*[[:space:]]*$" <<<"$CONTENT"
}
check "the encode matcher excludes /api/v1/admin/*" matcher_excludes_admin_api

# S2: everything else keeps compression. Static assets serve their sidecars.
keeps_formats() {
  grep -Eq '^[[:space:]]*encode[[:space:]]+@[A-Za-z0-9_-]+[[:space:]]+zstd[[:space:]]+gzip[[:space:]]*$' <<<"$CONTENT"
}
check "encode still offers zstd and gzip" keeps_formats

keeps_precompressed() {
  grep -Eq '^[[:space:]]*precompressed[[:space:]]+zstd[[:space:]]+gzip[[:space:]]*$' <<<"$CONTENT"
}
check "file_server still serves precompressed zstd and gzip sidecars" keeps_precompressed

keeps_api_proxy() {
  grep -Eq '^[[:space:]]*handle[[:space:]]+/api/\*[[:space:]]*\{' <<<"$CONTENT" &&
    grep -Eq '^[[:space:]]*reverse_proxy[[:space:]]+api:8080[[:space:]]*$' <<<"$CONTENT"
}
check "the /api/* handle still proxies to the Go backend" keeps_api_proxy

# The exclusion must not be widened into the public storefront API, which stays
# compressed: its responses carry no ETag used for optimistic locking.
excludes_only_admin_api() {
  ! grep -Eq '^[[:space:]]*@[A-Za-z0-9_-]+[[:space:]]+not[[:space:]]+path[[:space:]]+/api/\*[[:space:]]*$' <<<"$CONTENT"
}
check "the exclusion does not cover the whole public API" excludes_only_admin_api

echo "PASS: deploy/test-caddy.sh succeeded ($TESTS_PASSED/$TESTS_RUN)"
