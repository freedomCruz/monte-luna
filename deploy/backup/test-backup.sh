#!/usr/bin/env bash
set -euo pipefail

# test-backup.sh
# Verification suite for Monteluna backup, restore drill, systemd units, and configuration.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_SH="${SCRIPT_DIR}/backup.sh"
RESTORE_DRILL_SH="${SCRIPT_DIR}/restore-drill.sh"
SERVICE_FILE="${SCRIPT_DIR}/monteluna-backup.service"
TIMER_FILE="${SCRIPT_DIR}/monteluna-backup.timer"
ENV_EXAMPLE="${SCRIPT_DIR}/restic.env.example"
README_FILE="${SCRIPT_DIR}/README.md"

FAILED=0
TESTS_RUN=0

pass() {
  TESTS_RUN=$((TESTS_RUN + 1))
  echo "[PASS] $1"
}

fail() {
  TESTS_RUN=$((TESTS_RUN + 1))
  FAILED=$((FAILED + 1))
  echo "[FAIL] $1" >&2
  if [[ -n "${2:-}" ]]; then
    echo "       Detail: $2" >&2
  fi
}

echo "=== Running Backup and Restore Test Suite ==="

# -----------------------------------------------------------------------------
# 1. Existence and Syntax Checks
# -----------------------------------------------------------------------------
for f in "$BACKUP_SH" "$RESTORE_DRILL_SH" "$SERVICE_FILE" "$TIMER_FILE" "$ENV_EXAMPLE" "$README_FILE"; do
  if [[ ! -f "$f" ]]; then
    fail "Required file exists: $(basename "$f")" "File not found at $f"
  else
    pass "Required file exists: $(basename "$f")"
  fi
done

# If scripts are missing, report failure immediately
if [[ ! -f "$BACKUP_SH" || ! -f "$RESTORE_DRILL_SH" ]]; then
  echo "ERROR: Essential scripts missing. Aborting remaining dynamic checks." >&2
  echo "Tests run: $TESTS_RUN, Failed: $FAILED"
  exit 1
fi

# bash -n syntax checks
if bash -n "$BACKUP_SH"; then
  pass "backup.sh passes bash -n"
else
  fail "backup.sh passes bash -n" "Syntax error in backup.sh"
fi

if bash -n "$RESTORE_DRILL_SH"; then
  pass "restore-drill.sh passes bash -n"
else
  fail "restore-drill.sh passes bash -n" "Syntax error in restore-drill.sh"
fi

if bash -n "${BASH_SOURCE[0]}"; then
  pass "test-backup.sh passes bash -n"
else
  fail "test-backup.sh passes bash -n" "Syntax error in test-backup.sh"
fi

# -----------------------------------------------------------------------------
# 2. Static Assertions on backup.sh
# -----------------------------------------------------------------------------
if grep -q "set -euo pipefail" "$BACKUP_SH"; then
  pass "backup.sh uses set -euo pipefail"
else
  fail "backup.sh uses set -euo pipefail" "Missing 'set -euo pipefail' in backup.sh"
fi

# -----------------------------------------------------------------------------
# 3. Static Assertions on Systemd Units
# -----------------------------------------------------------------------------
if grep -q "Type=oneshot" "$SERVICE_FILE" && grep -q "User=root" "$SERVICE_FILE"; then
  pass "monteluna-backup.service has Type=oneshot and User=root"
else
  fail "monteluna-backup.service has Type=oneshot and User=root" "Missing Type=oneshot or User=root"
fi

# Hardening options
if grep -q "NoNewPrivileges=true" "$SERVICE_FILE" && \
   grep -q "ProtectSystem=" "$SERVICE_FILE" && \
   grep -q "ProtectHome=true" "$SERVICE_FILE" && \
   grep -q "PrivateTmp=true" "$SERVICE_FILE"; then
  pass "monteluna-backup.service includes systemd hardening options"
else
  fail "monteluna-backup.service includes systemd hardening options" "Missing hardening directives in service file"
fi

# Timer assertions
if grep -Eq "OnCalendar=(daily|\*-\*-\*)" "$TIMER_FILE" && \
   grep -q "Persistent=true" "$TIMER_FILE" && \
   grep -Eq "RandomizedDelaySec=" "$TIMER_FILE"; then
  pass "monteluna-backup.timer is daily, persistent, and has randomized delay"
else
  fail "monteluna-backup.timer is daily, persistent, and has randomized delay" "Missing OnCalendar, Persistent=true, or RandomizedDelaySec in timer file"
fi

# -----------------------------------------------------------------------------
# 4. Static Assertions on restic.env.example
# -----------------------------------------------------------------------------
if grep -q "RESTIC_REPOSITORY=s3:https://<account-id>.r2.cloudflarestorage.com/<bucket>" "$ENV_EXAMPLE" && \
   grep -q "AWS_ACCESS_KEY_ID=" "$ENV_EXAMPLE" && \
   grep -q "AWS_SECRET_ACCESS_KEY=" "$ENV_EXAMPLE" && \
   grep -q "RESTIC_PASSWORD_FILE=" "$ENV_EXAMPLE"; then
  pass "restic.env.example contains required placeholder variable names"
else
  fail "restic.env.example contains required placeholder variable names" "Missing required variable templates"
fi

# Check that restic.env.example contains no real credentials
if grep -Eq "([0-9a-f]{32}|AKIA[0-9A-Z]{16})" "$ENV_EXAMPLE"; then
  fail "restic.env.example contains no real credentials or IDs" "Suspicious account/key format found"
else
  pass "restic.env.example contains no real credentials or IDs"
fi

# -----------------------------------------------------------------------------
# 5. Dynamic Tests for backup.sh with Command Stubs
# -----------------------------------------------------------------------------
TEST_TMP="$(mktemp -d)"
STUB_BIN="${TEST_TMP}/bin"
mkdir -p "$STUB_BIN"

# Create stub stat that respects .mode files for portable permission assertions
cat <<'EOF' > "${STUB_BIN}/stat"
#!/usr/bin/env bash
target="${@: -1}"
if [[ -f "${target}.mode" ]]; then
  cat "${target}.mode"
  exit 0
fi
if [[ -n "${FAKE_STAT_MODE:-}" ]]; then
  echo "$FAKE_STAT_MODE"
  exit 0
fi
# Default mode for tests: 600
echo "600"
EOF
chmod +x "${STUB_BIN}/stat"

# Create stub docker
DOCKER_CALLS="${TEST_TMP}/docker_calls.log"
cat <<EOF > "${STUB_BIN}/docker"
#!/usr/bin/env bash
echo "docker \$*" >> "$DOCKER_CALLS"
if [[ "\$*" == *"volume inspect"* ]]; then
  echo "/var/lib/docker/volumes/monteluna_caddy_data/_data"
  exit 0
fi
if [[ "\$*" == *"pg_dump"* ]]; then
  echo "MOCK_PG_DUMP_DATA"
  exit 0
fi
exit 0
EOF
chmod +x "${STUB_BIN}/docker"

# Create stub restic
RESTIC_CALLS="${TEST_TMP}/restic_calls.log"
cat <<EOF > "${STUB_BIN}/restic"
#!/usr/bin/env bash
echo "restic \$*" >> "$RESTIC_CALLS"
exit 0
EOF
chmod +x "${STUB_BIN}/restic"

CLEAN_PATH="$PATH"
export PATH="${STUB_BIN}:${PATH}"

# Test 5.1: Missing restic.env
MOCK_BACKUP_DIR="${TEST_TMP}/backups/daily"
mkdir -p "$MOCK_BACKUP_DIR"
MISSING_ENV="${TEST_TMP}/nonexistent.env"

set +e
RESTIC_ENV_FILE="$MISSING_ENV" BACKUP_DIR="$MOCK_BACKUP_DIR" bash "$BACKUP_SH" > "${TEST_TMP}/missing_env.log" 2>&1
STATUS=$?
set -e
if [[ $STATUS -ne 0 ]]; then
  pass "backup.sh refuses to run when restic.env is missing"
else
  fail "backup.sh refuses to run when restic.env is missing" "Expected non-zero exit code, got 0"
fi

# Test 5.2: restic.env mode not 0600
RESTIC_ENV="${TEST_TMP}/restic.env"
RESTIC_PW="${TEST_TMP}/restic.pw"
SECRET_VAL="super_secret_aws_access_key_9999"
PASS_VAL="super_secret_restic_password_8888"

cat <<EOF > "$RESTIC_ENV"
RESTIC_REPOSITORY="s3:https://test.r2.cloudflarestorage.com/test-bucket"
AWS_ACCESS_KEY_ID="test_key_id"
AWS_SECRET_ACCESS_KEY="${SECRET_VAL}"
RESTIC_PASSWORD_FILE="${RESTIC_PW}"
EOF
echo "$PASS_VAL" > "$RESTIC_PW"

# Set simulated mode to 644
echo "644" > "${RESTIC_ENV}.mode"
set +e
RESTIC_ENV_FILE="$RESTIC_ENV" BACKUP_DIR="$MOCK_BACKUP_DIR" bash "$BACKUP_SH" > "${TEST_TMP}/bad_env_mode.log" 2>&1
STATUS=$?
set -e
if [[ $STATUS -ne 0 ]]; then
  pass "backup.sh refuses to run when restic.env mode is not 0600"
else
  fail "backup.sh refuses to run when restic.env mode is not 0600" "Expected non-zero exit code for mode 644"
fi
rm -f "${RESTIC_ENV}.mode"

# Test 5.3: Missing password file
BAD_PW_ENV="${TEST_TMP}/bad_pw.env"
cat <<EOF > "$BAD_PW_ENV"
RESTIC_REPOSITORY="s3:https://test.r2.cloudflarestorage.com/test-bucket"
AWS_ACCESS_KEY_ID="test_key_id"
AWS_SECRET_ACCESS_KEY="${SECRET_VAL}"
RESTIC_PASSWORD_FILE="${TEST_TMP}/missing.pw"
EOF
set +e
RESTIC_ENV_FILE="$BAD_PW_ENV" BACKUP_DIR="$MOCK_BACKUP_DIR" bash "$BACKUP_SH" > "${TEST_TMP}/missing_pw.log" 2>&1
STATUS=$?
set -e
if [[ $STATUS -ne 0 ]]; then
  pass "backup.sh refuses to run when password file is missing"
else
  fail "backup.sh refuses to run when password file is missing" "Expected non-zero exit code"
fi

# Test 5.4: Password file mode not 0600
echo "644" > "${RESTIC_PW}.mode"
set +e
RESTIC_ENV_FILE="$RESTIC_ENV" BACKUP_DIR="$MOCK_BACKUP_DIR" bash "$BACKUP_SH" > "${TEST_TMP}/bad_pw_mode.log" 2>&1
STATUS=$?
set -e
if [[ $STATUS -ne 0 ]]; then
  pass "backup.sh refuses to run when password file mode is not 0600"
else
  fail "backup.sh refuses to run when password file mode is not 0600" "Expected non-zero exit code for mode 644"
fi
rm -f "${RESTIC_PW}.mode"

# Test 5.5: Successful run, command order, retention, and no secret leakage
# Seed 10 older dumps to verify pruning down to 7
for i in {01..10}; do
  touch "${MOCK_BACKUP_DIR}/monteluna_2026100${i}_000000Z.dump"
done

> "$DOCKER_CALLS"
> "$RESTIC_CALLS"

set +e
EXEC_OUTPUT="${TEST_TMP}/backup_exec.log"
RESTIC_ENV_FILE="$RESTIC_ENV" BACKUP_DIR="$MOCK_BACKUP_DIR" bash "$BACKUP_SH" > "$EXEC_OUTPUT" 2>&1
STATUS=$?
set -e

if [[ $STATUS -eq 0 ]]; then
  pass "backup.sh executes successfully with valid config"
else
  fail "backup.sh executes successfully with valid config" "Failed with exit code $STATUS; log: $(cat "$EXEC_OUTPUT")"
fi

# Verify secret leakage
if grep -q "$SECRET_VAL" "$EXEC_OUTPUT" || grep -q "$PASS_VAL" "$EXEC_OUTPUT"; then
  fail "backup.sh never prints secret values" "Secret found in stdout/stderr output"
else
  pass "backup.sh never prints secret values"
fi

# Verify docker compose pg_dump was invoked before restic
if grep -Eq "compose -p monteluna exec -T postgres .*pg_dump" "$DOCKER_CALLS" && \
   grep -Eq "compose -p monteluna exec -T postgres .*-Fc" "$DOCKER_CALLS"; then
  pass "backup.sh dumps with pg_dump -Fc through docker compose -p monteluna exec -T postgres"
else
  fail "backup.sh dumps with pg_dump -Fc through docker compose -p monteluna exec -T postgres" "Call missing in docker log: $(cat "$DOCKER_CALLS")"
fi

# Verify restic backup backed up both dump dir and caddy_data mountpoint
if grep -q "restic backup .*${MOCK_BACKUP_DIR}" "$RESTIC_CALLS" && \
   grep -q "restic backup .*/var/lib/docker/volumes/monteluna_caddy_data/_data" "$RESTIC_CALLS"; then
  pass "backup.sh backs up both dump dir and caddy_data volume mountpoint"
else
  fail "backup.sh backs up both dump dir and caddy_data volume mountpoint" "Call missing in restic log: $(cat "$RESTIC_CALLS")"
fi

# Verify restic forget retention policy
if grep -q "forget --keep-daily 7 --keep-weekly 4 --keep-monthly 6 --prune" "$RESTIC_CALLS"; then
  pass "backup.sh runs restic forget with 7 daily, 4 weekly, 6 monthly and --prune"
else
  fail "backup.sh runs restic forget with 7 daily, 4 weekly, 6 monthly and --prune" "Restic forget call missing or invalid: $(cat "$RESTIC_CALLS")"
fi

# Verify restic check
if grep -q "restic check" "$RESTIC_CALLS"; then
  pass "backup.sh runs restic check"
else
  fail "backup.sh runs restic check" "Restic check call missing"
fi

# Verify local dump retention (exactly 7 remaining)
DUMP_COUNT="$(find "$MOCK_BACKUP_DIR" -maxdepth 1 -name "*.dump" | wc -l)"
if [[ "$DUMP_COUNT" -eq 7 ]]; then
  pass "backup.sh retains exactly the last 7 local daily dumps"
else
  fail "backup.sh retains exactly the last 7 local daily dumps" "Expected 7 dumps, found $DUMP_COUNT"
fi

# -----------------------------------------------------------------------------
# 6. Dynamic Tests for restore-drill.sh
# -----------------------------------------------------------------------------
# Static check on restore-drill.sh
if grep -q "set -euo pipefail" "$RESTORE_DRILL_SH" && \
   grep -q "trap " "$RESTORE_DRILL_SH" && \
   grep -q "restore_drill" "$RESTORE_DRILL_SH"; then
  pass "restore-drill.sh uses set -euo pipefail, trap, and targets restore_drill"
else
  fail "restore-drill.sh uses set -euo pipefail, trap, and targets restore_drill" "Missing set -euo pipefail or trap cleanup"
fi

# Reconfigure stub docker for restore drill tests
cat <<EOF > "${STUB_BIN}/docker"
#!/usr/bin/env bash
echo "docker \$*" >> "$DOCKER_CALLS"
if [[ "\$*" == *"SELECT count(*)"* ]]; then
  # Sanity check query
  if [[ "\${FAIL_MODULE:-}" != "" && "\$*" == *"\${FAIL_MODULE}.goose_db_version"* ]]; then
    echo "0"
  else
    echo "5"
  fi
  exit 0
fi
exit 0
EOF

# Test 6.1: restore-drill.sh fails when no dumps exist
EMPTY_DIR="${TEST_TMP}/empty_backups"
mkdir -p "$EMPTY_DIR"
set +e
BACKUP_DIR="$EMPTY_DIR" bash "$RESTORE_DRILL_SH" > "${TEST_TMP}/empty_restore.log" 2>&1
STATUS=$?
set -e
if [[ $STATUS -ne 0 ]]; then
  pass "restore-drill.sh fails when no dump files exist"
else
  fail "restore-drill.sh fails when no dump files exist" "Expected non-zero exit code"
fi

# Test 6.2: Successful restore drill execution
> "$DOCKER_CALLS"
set +e
DRILL_LOG="${TEST_TMP}/drill.log"
BACKUP_DIR="$MOCK_BACKUP_DIR" bash "$RESTORE_DRILL_SH" > "$DRILL_LOG" 2>&1
STATUS=$?
set -e
if [[ $STATUS -eq 0 ]]; then
  pass "restore-drill.sh succeeds on valid dump and healthy migrations"
else
  fail "restore-drill.sh succeeds on valid dump and healthy migrations" "Failed with exit code $STATUS; log: $(cat "$DRILL_LOG")"
fi

# Verify pg_restore --no-owner
if grep -Eq "pg_restore .*--no-owner" "$DOCKER_CALLS"; then
  pass "restore-drill.sh calls pg_restore with --no-owner"
else
  fail "restore-drill.sh calls pg_restore with --no-owner" "Missing pg_restore --no-owner call in docker log"
fi

# Verify sanity check on each module's goose_db_version
for mod in catalog shipping orders payments; do
  if grep -q "${mod}.goose_db_version" "$DOCKER_CALLS"; then
    pass "restore-drill.sh queries ${mod}.goose_db_version"
  else
    fail "restore-drill.sh queries ${mod}.goose_db_version" "Query for ${mod}.goose_db_version missing in docker log"
  fi
done

# Verify temporary database drop (clean up via trap or completion)
if grep -q "DROP DATABASE IF EXISTS restore_drill" "$DOCKER_CALLS"; then
  pass "restore-drill.sh drops restore_drill database"
else
  fail "restore-drill.sh drops restore_drill database" "DROP DATABASE call missing in docker log"
fi

# Test 6.3: restore-drill.sh fails and drops DB when a module sanity query fails
> "$DOCKER_CALLS"
set +e
FAIL_MODULE="payments" BACKUP_DIR="$MOCK_BACKUP_DIR" bash "$RESTORE_DRILL_SH" > "${TEST_TMP}/drill_fail.log" 2>&1
STATUS=$?
set -e
if [[ $STATUS -ne 0 ]]; then
  pass "restore-drill.sh fails when a module sanity check fails"
else
  fail "restore-drill.sh fails when a module sanity check fails" "Expected non-zero exit code when payments has 0 migrations"
fi

# Verify trap dropped database despite failure
if grep -q "DROP DATABASE IF EXISTS restore_drill" "$DOCKER_CALLS"; then
  pass "restore-drill.sh drops restore_drill on failure via trap"
else
  fail "restore-drill.sh drops restore_drill on failure via trap" "DROP DATABASE not called on failure"
fi

# Review regressions
if grep -qx 'Environment=RESTIC_CACHE_DIR=/var/cache/restic' "$SCRIPT_DIR/monteluna-backup.service" \
  && grep -qx 'CacheDirectory=restic' "$SCRIPT_DIR/monteluna-backup.service"; then
  pass "Service gives restic a writable cache outside ProtectHome"
else
  fail "Service restic cache" "Expected Environment=RESTIC_CACHE_DIR=/var/cache/restic and CacheDirectory=restic"
fi
for bad_db in postgres monteluna; do
  drill_out="$(DRILL_DB="$bad_db" POSTGRES_DB=monteluna BACKUP_DIR="$TEST_TMP" bash "$SCRIPT_DIR/restore-drill.sh" 2>&1)" && drill_rc=0 || drill_rc=$?
  if [[ "$drill_rc" -ne 0 ]] && printf '%s' "$drill_out" | grep -q 'cannot be the production'; then
    pass "restore-drill.sh refuses DRILL_DB=$bad_db"
  else
    fail "restore-drill.sh refuses DRILL_DB=$bad_db" "rc=$drill_rc output=$drill_out"
  fi
done

# Cleanup
export PATH="$CLEAN_PATH"
rm -rf "$TEST_TMP"

echo "=== Summary ==="
echo "Total tests: $TESTS_RUN, Failed: $FAILED"
if [[ $FAILED -gt 0 ]]; then
  exit 1
fi
echo "All backup and restore tests PASSED."
exit 0
