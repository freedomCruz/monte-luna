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

# odd/tasks/admin-navigation-v1.md T2, S3: Cache-Control policy for static assets.
#
# No Caddy binary is assumed, so these are static text assertions on exact
# directives and matchers. The policy lives only in the catch-all static handle:
# the /api/* proxy must not gain a Cache-Control header, so the backend's own
# value (no-store on admin and private responses) reaches the browser untouched.

# Prints the body of the site-level block whose opening line matches $1.
# Directives inside the site block are indented by one tab, so the block closes
# on a line holding a single tab and a closing brace.
site_block() {
  BLOCK_START="$1" awk '
    $0 ~ ENVIRON["BLOCK_START"] { inside = 1; next }
    inside && /^\t\}[[:space:]]*$/ { exit }
    inside { print }
  ' <<<"$CONTENT"
}

STATIC_HANDLE="$(site_block '^\thandle[[:space:]]*\{[[:space:]]*$')"
API_HANDLE="$(site_block '^\thandle[[:space:]]+/api/\*[[:space:]]*\{[[:space:]]*$')"
SITE_HEADER="$(site_block '^\theader[[:space:]]*\{[[:space:]]*$')"

# Prints the name of the matcher declared as "@name <kind> /_astro/* /fonts/*".
hashed_matcher_name() {
  grep -E "^[[:space:]]*@[A-Za-z0-9_-]+[[:space:]]+$1[[:space:]]+/_astro/\*[[:space:]]+/fonts/\*[[:space:]]*\$" <<<"$STATIC_HANDLE" |
    grep -Eo '@[A-Za-z0-9_-]+' | head -1 || true
}

hashed_assets_are_immutable() {
  local name
  name="$(hashed_matcher_name 'path')"
  [[ -n "$name" ]] || return 1
  grep -Fxq $'\t\theader '"$name"' Cache-Control "public, max-age=31536000, immutable"' <<<"$STATIC_HANDLE"
}
check "hashed /_astro/* and /fonts/* assets get Cache-Control public, max-age=31536000, immutable" hashed_assets_are_immutable

documents_are_revalidated() {
  local name
  name="$(hashed_matcher_name 'not[[:space:]]+path')"
  [[ -n "$name" ]] || return 1
  grep -Fxq $'\t\theader '"$name"' Cache-Control "no-cache, must-revalidate"' <<<"$STATIC_HANDLE"
}
check "everything outside the hashed paths (HTML documents) gets Cache-Control no-cache, must-revalidate" documents_are_revalidated

# A site-level header block or a handle-less header would also hit /api/*.
api_proxy_has_no_cache_control() {
  [[ -n "$API_HANDLE" ]] &&
    ! grep -qi 'cache-control' <<<"$API_HANDLE" &&
    ! grep -qi 'cache-control' <<<"$SITE_HEADER"
}
check "the /api/* handle and the site-wide header block set no Cache-Control" api_proxy_has_no_cache_control

cache_control_only_in_static_handle() {
  local total inside
  # Only directive lines count; comments may mention the header name.
  total="$(grep -Eci '^[[:space:]]*header[[:space:]].*cache-control' <<<"$CONTENT" || true)"
  inside="$(grep -Eci '^[[:space:]]*header[[:space:]].*cache-control' <<<"$STATIC_HANDLE" || true)"
  [[ "$total" -ge 1 && "$total" -eq "$inside" ]]
}
check "every Cache-Control header directive sits inside the catch-all static handle" cache_control_only_in_static_handle

pending_comment_removed() {
  ! grep -qi 'pending infrastructure improvement' <<<"$CONTENT"
}
check "the pending cache policy comment is gone" pending_comment_removed

echo "PASS: deploy/test-caddy.sh succeeded ($TESTS_PASSED/$TESTS_RUN)"
