#!/usr/bin/env bash
# ==============================================================================
# deploy/test-deploy.sh
# Tests for deploy/deploy.sh per odd/tasks/deploy-v1.md T4, S1, S3.
# ==============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_SCRIPT="${SCRIPT_DIR}/deploy.sh"

TESTS_RUN=0
TESTS_PASSED=0

pass() {
  TESTS_PASSED=$((TESTS_PASSED + 1))
  echo "  OK: $1"
}

fail() {
  echo "FAIL: $1" >&2
  exit 1
}

run_test() {
  TESTS_RUN=$((TESTS_RUN + 1))
  local test_name="$1"
  echo "Running test: ${test_name}..."
  "$test_name"
}

# Source deploy.sh without executing main
if [ ! -f "$DEPLOY_SCRIPT" ]; then
  fail "deploy.sh does not exist at ${DEPLOY_SCRIPT}"
fi

# shellcheck source=deploy/deploy.sh
. "$DEPLOY_SCRIPT"

# ==============================================================================
# Test Cases
# ==============================================================================

test_arg_validation() {
  # 1. Missing arguments
  if validate_deploy_args 2>/dev/null; then
    fail "validate_deploy_args should fail with 0 arguments"
  fi
  if validate_deploy_args "my-host" 2>/dev/null; then
    fail "validate_deploy_args should fail with 1 argument"
  fi

  # 2. Too many arguments
  if validate_deploy_args "my-host" "v1.0.0" "extra-arg" 2>/dev/null; then
    fail "validate_deploy_args should fail with >2 arguments"
  fi

  # 3. Invalid SSH alias
  if validate_deploy_args "-bad-alias" "v1.0.0" 2>/dev/null; then
    fail "validate_deploy_args should fail for alias starting with dash"
  fi
  if validate_deploy_args "alias with spaces" "v1.0.0" 2>/dev/null; then
    fail "validate_deploy_args should fail for alias with spaces"
  fi
  if validate_deploy_args "alias;injection" "v1.0.0" 2>/dev/null; then
    fail "validate_deploy_args should fail for alias with semicolon"
  fi

  # 4. Invalid SemVer tag
  if validate_deploy_args "my-host" "1.0.0" 2>/dev/null; then
    fail "validate_deploy_args should fail for tag missing 'v' prefix"
  fi
  if validate_deploy_args "my-host" "v1" 2>/dev/null; then
    fail "validate_deploy_args should fail for incomplete tag v1"
  fi
  if validate_deploy_args "my-host" "v1.0" 2>/dev/null; then
    fail "validate_deploy_args should fail for incomplete tag v1.0"
  fi
  if validate_deploy_args "my-host" "latest" 2>/dev/null; then
    fail "validate_deploy_args should fail for 'latest'"
  fi
  if validate_deploy_args "my-host" "v1.0.0;rm -rf" 2>/dev/null; then
    fail "validate_deploy_args should fail for tag with injection"
  fi

  # 5. Valid arguments
  if ! validate_deploy_args "my-host" "v1.0.0"; then
    fail "validate_deploy_args failed for valid alias and v1.0.0"
  fi
  if ! validate_deploy_args "prod_vps-01" "v0.12.34-rc.1"; then
    fail "validate_deploy_args failed for valid alias and v0.12.34-rc.1"
  fi

  pass "Argument and SemVer validation"
}

test_release_id_format() {
  local tag="v1.2.3"
  local sha="482318ab9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f"
  local release_id
  release_id="$(compute_release_id "$tag" "$sha")"

  if [ "$release_id" != "v1.2.3-482318a" ]; then
    fail "Expected 'v1.2.3-482318a', got '${release_id}'"
  fi

  if [[ ! "$release_id" =~ ^v[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?-[0-9a-f]{7}$ ]]; then
    fail "Release ID '${release_id}' does not match required format <tag>-<sha7>"
  fi

  pass "Release ID format <tag>-<sha7>"
}

test_preflight_git_checks() {
  local tmp_repo
  tmp_repo="$(mktemp -d /tmp/monteluna-test-git-XXXXXX)"

  # Initialize git repo with initial commit and tag v1.0.0
  git -C "$tmp_repo" init -q -b main
  git -C "$tmp_repo" config user.email "deploy-test@example.com"
  git -C "$tmp_repo" config user.name "Deploy Test"
  echo "initial" > "${tmp_repo}/file.txt"
  git -C "$tmp_repo" add file.txt
  git -C "$tmp_repo" commit -q -m "initial commit"
  git -C "$tmp_repo" tag "v1.0.0"

  # Case 1: Clean tree, existing tag, HEAD == tag -> should succeed
  if ! validate_git_preflight "$tmp_repo" "v1.0.0"; then
    rm -rf "$tmp_repo"
    fail "validate_git_preflight should succeed for clean repo with HEAD at tag"
  fi

  # Case 2: Missing tag
  if validate_git_preflight "$tmp_repo" "v2.0.0" 2>/dev/null; then
    rm -rf "$tmp_repo"
    fail "validate_git_preflight should fail when tag does not exist"
  fi

  # Case 3: HEAD not at tag
  echo "second" > "${tmp_repo}/file2.txt"
  git -C "$tmp_repo" add file2.txt
  git -C "$tmp_repo" commit -q -m "second commit"
  if validate_git_preflight "$tmp_repo" "v1.0.0" 2>/dev/null; then
    rm -rf "$tmp_repo"
    fail "validate_git_preflight should fail when HEAD is ahead of tag"
  fi

  # Reset back to tag
  git -C "$tmp_repo" reset --hard -q v1.0.0

  # Case 4: Dirty tree (modified tracked file)
  echo "dirt" >> "${tmp_repo}/file.txt"
  if validate_git_preflight "$tmp_repo" "v1.0.0" 2>/dev/null; then
    rm -rf "$tmp_repo"
    fail "validate_git_preflight should fail when tracked file is dirty"
  fi
  git -C "$tmp_repo" checkout -q -- file.txt

  # Case 5: Dirty tree (untracked file)
  echo "untracked" > "${tmp_repo}/untracked.txt"
  if validate_git_preflight "$tmp_repo" "v1.0.0" 2>/dev/null; then
    rm -rf "$tmp_repo"
    fail "validate_git_preflight should fail when untracked file exists"
  fi
  rm -f "${tmp_repo}/untracked.txt"

  # Case 6: a directory git cannot read must fail closed, never count as clean
  local not_repo
  not_repo="$(mktemp -d)"
  if validate_git_preflight "$not_repo" "v1.0.0" 2>/dev/null; then
    rm -rf "$tmp_repo" "$not_repo"
    fail "validate_git_preflight should fail when git cannot read the repository"
  fi
  local not_repo_err
  not_repo_err="$(validate_git_preflight "$not_repo" "v1.0.0" 2>&1 >/dev/null || true)"
  rm -rf "$not_repo"
  case "$not_repo_err" in
    *"Cannot read git status"*) ;;
    *) rm -rf "$tmp_repo"; fail "unreadable repository must report 'Cannot read git status', got: $not_repo_err" ;;
  esac

  rm -rf "$tmp_repo"
  pass "Preflight git checks (dirty tree, missing tag, HEAD not at tag, unreadable repository)"
}

test_generated_remote_script() {
  local release_id="v1.0.0-482318a"
  local commit_sha="482318ab9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f"
  local staging_dir="/tmp/monteluna-staging-${release_id}"
  local script
  script="$(generate_remote_script "$release_id" "$commit_sha" "$staging_dir")"

  # 1. Passes bash -n syntax check
  if ! printf '%s\n' "$script" | bash -n; then
    fail "Generated remote script failed 'bash -n' syntax validation"
  fi

  # 2. Check execution order:
  # pre-deploy dump -> migrate -> up -> health check -> rollback-on-failure -> record
  local idx_dump idx_migrate idx_up idx_health idx_rollback idx_record

  idx_dump="$(printf '%s\n' "$script" | grep -n "pg_dump" | head -n 1 | cut -d: -f1)"
  idx_migrate="$(printf '%s\n' "$script" | grep -n "/app/migrate" | head -n 1 | cut -d: -f1)"
  idx_up="$(printf '%s\n' "$script" | grep -n "docker compose.*COMPOSE_FILE.*up -d" | head -n 1 | cut -d: -f1)"
  idx_health="$(printf '%s\n' "$script" | grep -n "api/v1/health" | head -n 1 | cut -d: -f1)"
  idx_rollback="$(printf '%s\n' "$script" | grep -n "PREV_RELEASE.*up -d" | tail -n 1 | cut -d: -f1)"
  idx_record="$(printf '%s\n' "$script" | grep -n "SUCCESS.*RELEASES_LOG" | head -n 1 | cut -d: -f1)"

  if [ -z "$idx_dump" ] || [ -z "$idx_migrate" ] || [ -z "$idx_up" ] || [ -z "$idx_health" ] || [ -z "$idx_rollback" ] || [ -z "$idx_record" ]; then
    fail "Generated remote script is missing one of the required steps (dump, migrate, up, health, rollback, record)"
  fi

  if ! [ "$idx_dump" -lt "$idx_migrate" ]; then
    fail "Order violation: pre-deploy dump (line $idx_dump) must precede migrate (line $idx_migrate)"
  fi

  if ! [ "$idx_migrate" -lt "$idx_up" ]; then
    fail "Order violation: migrate (line $idx_migrate) must precede up (line $idx_up)"
  fi

  if ! [ "$idx_up" -lt "$idx_health" ]; then
    fail "Order violation: up (line $idx_up) must precede health check (line $idx_health)"
  fi

  if ! [ "$idx_health" -lt "$idx_rollback" ]; then
    fail "Order violation: health check (line $idx_health) must precede rollback on failure (line $idx_rollback)"
  fi

  if ! [ "$idx_rollback" -lt "$idx_record" ]; then
    fail "Order violation: rollback on failure (line $idx_rollback) must precede record on success (line $idx_record)"
  fi

  pass "Generated remote script passes bash -n and follows strict step order"
}

test_review_regressions() {
  local script
  script="$(generate_remote_script v1.0.0-482318a 482318ab9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f /tmp/monteluna-staging-test)"
  # The rollback log must record the failed release, not the one restored.
  if ! printf '%s
' "$script" | grep -q 'FAILED_RELEASE="${MONTELUNA_RELEASE}"'; then
    fail "Rollback must capture FAILED_RELEASE before switching MONTELUNA_RELEASE"
  fi
  if ! printf '%s
' "$script" | grep -q '"${FAILED_RELEASE}" "${COMMIT_SHA}"'; then
    fail "Rollback log line must start with FAILED_RELEASE"
  fi
  # An empty pre-deploy dump must stop the deploy before migrations.
  if ! printf '%s
' "$script" | grep -q 'Pre-deploy database dump is empty'; then
    fail "Pre-deploy dump must be checked for non-zero size"
  fi
  pass "Review regressions: rollback log records the failed release; empty dump stops the deploy"
}

test_rollback_and_first_deploy_behavior() {
  local release_id="v1.0.0-482318a"
  local commit_sha="482318ab9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f"
  local staging_dir="/tmp/monteluna-staging-${release_id}"
  local script
  script="$(generate_remote_script "$release_id" "$commit_sha" "$staging_dir")"

  # Assert rollback restarts the 'previous' release
  if ! printf '%s\n' "$script" | grep -q 'PREV_RELEASE'; then
    fail "Remote script does not handle PREV_RELEASE for rollback"
  fi
  if ! printf '%s\n' "$script" | grep -q 'PREV_RELEASE.*compose.yaml'; then
    fail "Remote script rollback does not restart previous release compose"
  fi

  # Assert first deploy (no previous) fails clearly instead of rolling back to nothing
  if ! printf '%s\n' "$script" | grep -E -q 'no previous release to roll back to'; then
    fail "Remote script does not have clear failure message when no previous release exists"
  fi

  pass "Rollback restarts previous release and first deploy fails clearly"
}

test_health_check_spec() {
  local release_id="v1.0.0-482318a"
  local commit_sha="482318ab9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f"
  local staging_dir="/tmp/monteluna-staging-${release_id}"
  local script
  script="$(generate_remote_script "$release_id" "$commit_sha" "$staging_dir")"

  # Assert health check targets /api/v1/health with --resolve <SITE_ADDRESS>:443:127.0.0.1
  if ! printf '%s\n' "$script" | grep -q -- '--resolve'; then
    fail "Health check is missing --resolve flag"
  fi
  if ! printf '%s\n' "$script" | grep -q '443:127.0.0.1'; then
    fail "Health check --resolve does not target 443:127.0.0.1"
  fi
  if ! printf '%s\n' "$script" | grep -q '/api/v1/health'; then
    fail "Health check does not target /api/v1/health"
  fi

  # Assert bounded 60-second retry loop
  if ! printf '%s\n' "$script" | grep -q '60'; then
    fail "Health check does not enforce 60-second retry bound"
  fi

  pass "Health check targets /api/v1/health with --resolve <SITE_ADDRESS>:443:127.0.0.1 and 60s timeout"
}

test_security_rules() {
  # Inspect deploy.sh and generated remote script for forbidden patterns
  local release_id="v1.0.0-482318a"
  local commit_sha="482318ab9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f"
  local staging_dir="/tmp/monteluna-staging-${release_id}"
  local remote_script
  remote_script="$(generate_remote_script "$release_id" "$commit_sha" "$staging_dir")"

  # 1. No sshpass
  if grep -i -q "sshpass" "$DEPLOY_SCRIPT"; then
    fail "deploy.sh contains forbidden 'sshpass'"
  fi

  # 2. No StrictHostKeyChecking=no
  if grep -i -q "StrictHostKeyChecking=no" "$DEPLOY_SCRIPT"; then
    fail "deploy.sh contains forbidden 'StrictHostKeyChecking=no'"
  fi

  # 3. No captured ssh -t output ($(ssh -t ...))
  if grep -E -q '\$\(ssh[[:space:]]+.*-t' "$DEPLOY_SCRIPT"; then
    fail "deploy.sh captures ssh -t output via \$(ssh -t ...)"
  fi
  if grep -E -q '`ssh[[:space:]]+.*-t' "$DEPLOY_SCRIPT"; then
    fail "deploy.sh captures ssh -t output via backticks"
  fi

  # 4. No docker group usage (usermod -aG docker, etc.)
  if grep -E -q '(usermod|groupadd|gpasswd).*docker' "$DEPLOY_SCRIPT"; then
    fail "deploy.sh contains forbidden docker group usage"
  fi
  if printf '%s\n' "$remote_script" | grep -E -q '(usermod|groupadd|gpasswd).*docker'; then
    fail "Remote script contains forbidden docker group usage"
  fi

  # 5. No secret values hard-coded in deploy.sh
  # Check for common sensitive patterns
  if grep -E -i -q '(password|secret|token)[[:space:]]*=[[:space:]]*["'\''][^"'\'']{4,}["'\'']' "$DEPLOY_SCRIPT"; then
    fail "deploy.sh appears to contain hard-coded secret values"
  fi

  pass "Security checks (no sshpass, no StrictHostKeyChecking=no, no \$(ssh -t), no docker group, no secrets)"
}

test_ci_gate_determinism() {
  local repo_root
  repo_root="$(cd "$SCRIPT_DIR/.." && pwd)"
  local deterministic_test='go test -p 1 -count=1 -mod=readonly ./...'

  if ! grep -Fq -- "$deterministic_test" "$repo_root/Taskfile.yml"; then
    fail "Taskfile backend gate must run fresh package-serial Go tests"
  fi
  if ! grep -Fq -- "$deterministic_test" "$DEPLOY_SCRIPT"; then
    fail "deploy.sh fallback gate must run fresh package-serial Go tests"
  fi

  pass "Local CI gates run fresh package-serial Go tests"
}

# ==============================================================================
# Runner
# ==============================================================================

main() {
  echo "=== Running deploy/test-deploy.sh ==="
  run_test test_arg_validation
  run_test test_release_id_format
  run_test test_preflight_git_checks
  run_test test_generated_remote_script
  run_test test_rollback_and_first_deploy_behavior
  run_test test_health_check_spec
  run_test test_security_rules
  run_test test_review_regressions
  run_test test_ci_gate_determinism

  echo "=== All $TESTS_PASSED/$TESTS_RUN tests passed ==="
}

main "$@"
