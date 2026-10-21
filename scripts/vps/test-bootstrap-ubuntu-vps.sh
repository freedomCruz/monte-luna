#!/usr/bin/env bash
# ==============================================================================
# Test runner for scripts/vps/bootstrap-ubuntu-vps.sh
# Covers all requirements under odd/tasks/vps-bootstrap-script.md > Design > Tests.
# Exits non-zero on any failure.
# ==============================================================================

set -u

FAILED=0
PASSED=0

pass() {
  PASSED=$((PASSED + 1))
  printf "  [PASS] %s\n" "$1"
}

fail() {
  FAILED=$((FAILED + 1))
  printf "  [FAIL] %s: %s\n" "$1" "$2"
}

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DRIVER="${SCRIPT_DIR}/bootstrap-ubuntu-vps.sh"

echo "=== Running VPS bootstrap test suite ==="

# ------------------------------------------------------------------------------
# Test 1: Driver file exists and is executable
# ------------------------------------------------------------------------------
if [[ ! -f "$DRIVER" ]]; then
  echo "CRITICAL: Driver script $DRIVER not found."
  exit 1
fi

if [[ -x "$DRIVER" ]]; then
  pass "Driver script is executable"
else
  fail "Driver script is executable" "File is not executable (+x)"
fi

# ------------------------------------------------------------------------------
# Test 2: Sourcing driver does not execute main
# ------------------------------------------------------------------------------
# Sourcing should export functions without starting interactive prompts or main
# We test this in a subshell to avoid state pollution.
if (source "$DRIVER" >/dev/null 2>&1); then
  pass "Sourcing driver exits with status 0 and does not block"
else
  fail "Sourcing driver" "Failed to source $DRIVER"
fi

# Source for subsequent function testing
# shellcheck source=scripts/vps/bootstrap-ubuntu-vps.sh
source "$DRIVER"

# ------------------------------------------------------------------------------
# Test 3: Input Validators
# ------------------------------------------------------------------------------
echo "--- Testing Input Validators ---"

# Server address: IPv4, IPv6, Hostname
valid_servers=("203.0.113.10" "192.168.1.1" "2001:db8::1" "::1" "vps.example.com" "srv-01.infra.monteluna.co" "localhost")
for s in "${valid_servers[@]}"; do
  if validate_server_address "$s" >/dev/null 2>&1; then
    pass "validate_server_address accepts: $s"
  else
    fail "validate_server_address" "Rejected valid address: $s"
  fi
done

invalid_servers=("" " " "256.0.0.1" "1.2.3.4.5" "bad address" "http://203.0.113.10" "user@host" "-invalid")
for s in "${invalid_servers[@]}"; do
  if validate_server_address "$s" >/dev/null 2>&1; then
    fail "validate_server_address" "Accepted invalid address: '$s'"
  else
    pass "validate_server_address rejects: '$s'"
  fi
done

# Username: ^[a-z][a-z0-9_-]{0,31}$, never root
valid_users=("monteluna" "admin_user" "admin-user" "u" "user01" "a_b_c-d")
for u in "${valid_users[@]}"; do
  if validate_username "$u" >/dev/null 2>&1; then
    pass "validate_username accepts: $u"
  else
    fail "validate_username" "Rejected valid username: $u"
  fi
done

invalid_users=("root" "ROOT" "1admin" "Admin" "-admin" "_admin" "" "toolongusername12345678901234567890123" "user name" "user@host")
for u in "${invalid_users[@]}"; do
  if validate_username "$u" >/dev/null 2>&1; then
    fail "validate_username" "Accepted invalid username: '$u'"
  else
    pass "validate_username rejects: '$u'"
  fi
done

# Alias: same pattern as username
valid_aliases=("contabo-vps" "srv-1" "my_server" "prod01")
for a in "${valid_aliases[@]}"; do
  if validate_alias "$a" >/dev/null 2>&1; then
    pass "validate_alias accepts: $a"
  else
    fail "validate_alias" "Rejected valid alias: $a"
  fi
done

invalid_aliases=("root" "1server" "Server" "" "-srv" "_srv" "server name" "toolongalias1234567890123456789012345")
for a in "${invalid_aliases[@]}"; do
  if validate_alias "$a" >/dev/null 2>&1; then
    fail "validate_alias" "Accepted invalid alias: '$a'"
  else
    pass "validate_alias rejects: '$a'"
  fi
done

# Swap size: integer 0-8
valid_swaps=("0" "1" "2" "4" "8")
for sw in "${valid_swaps[@]}"; do
  if validate_swap_size "$sw" >/dev/null 2>&1; then
    pass "validate_swap_size accepts: $sw"
  else
    fail "validate_swap_size" "Rejected valid swap size: $sw"
  fi
done

invalid_swaps=("-1" "9" "16" "2.5" "2GB" "abc" "" " ")
for sw in "${invalid_swaps[@]}"; do
  if validate_swap_size "$sw" >/dev/null 2>&1; then
    fail "validate_swap_size" "Accepted invalid swap size: '$sw'"
  else
    pass "validate_swap_size rejects: '$sw'"
  fi
done

# ------------------------------------------------------------------------------
# Test 4: Remote Phase Scripts Syntax Check (bash -n)
# ------------------------------------------------------------------------------
echo "--- Testing Generated Remote Scripts Syntax (bash -n) ---"

test_pubkey="ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIExamplePublicKeyForTestingOnly test-key"

phases=(
  "phase2:$(generate_phase2_script "testuser" "$test_pubkey")"
  "phase3:$(generate_phase3_script)"
  "phase4:$(generate_phase4_script)"
  "phase5:$(generate_phase5_script)"
  "phase6:$(generate_phase6_script 2)"
  "phase7:$(generate_phase7_script)"
  "phase8:$(generate_phase8_script "testuser" 2)"
)

for item in "${phases[@]}"; do
  pname="${item%%:*}"
  pcontent="${item#*:}"

  if printf "%s\n" "$pcontent" | bash -n; then
    pass "Generated script for $pname passes bash -n"
  else
    fail "Generated script for $pname" "bash -n reported syntax errors"
  fi
done

# ------------------------------------------------------------------------------
# Test 5: P5 Drop-in Content and Directives
# ------------------------------------------------------------------------------
echo "--- Testing P5 SSH Hardening Directives ---"

p5_script="$(generate_phase5_script)"
expected_file="/etc/ssh/sshd_config.d/00-bootstrap-hardening.conf"

if [[ "$p5_script" == *"$expected_file"* ]]; then
  pass "P5 script references drop-in path: $expected_file"
else
  fail "P5 script drop-in path" "Missing $expected_file in P5 script"
fi

for directive in "PermitRootLogin no" "PasswordAuthentication no" "KbdInteractiveAuthentication no" "PubkeyAuthentication yes"; do
  if [[ "$p5_script" == *"$directive"* ]]; then
    pass "P5 script contains directive: $directive"
  else
    fail "P5 script directive" "Missing directive '$directive'"
  fi
done

# ------------------------------------------------------------------------------
# Test 6: Ordering and Safety Gates in P4 and P5
# ------------------------------------------------------------------------------
echo "--- Testing Ordering & Rollbacks in P4 & P5 ---"

# In P4: 'allow OpenSSH' must precede 'enable', and systemd-run rollback must precede 'enable'
p4_script="$(generate_phase4_script)"

pos_allow=$(printf "%s" "$p4_script" | grep -n "ufw allow OpenSSH" | head -n1 | cut -d: -f1)
pos_enable=$(printf "%s" "$p4_script" | grep -n "ufw --force enable" | head -n1 | cut -d: -f1)
pos_p4_rollback=$(printf "%s" "$p4_script" | grep -n "systemd-run.*ufw" | head -n1 | cut -d: -f1)

if [[ -n "$pos_allow" && -n "$pos_enable" && "$pos_allow" -lt "$pos_enable" ]]; then
  pass "P4: 'ufw allow OpenSSH' precedes 'ufw --force enable'"
else
  fail "P4 rule ordering" "ufw allow OpenSSH must precede ufw enable (allow: $pos_allow, enable: $pos_enable)"
fi

if [[ -n "$pos_p4_rollback" && -n "$pos_enable" && "$pos_p4_rollback" -lt "$pos_enable" ]]; then
  pass "P4: systemd-run rollback is scheduled before 'ufw --force enable'"
else
  fail "P4 rollback scheduling" "systemd-run rollback must precede ufw enable (rollback: $pos_p4_rollback, enable: $pos_enable)"
fi

# In P5: 'sshd -t' precedes reload, and systemd-run rollback precedes reload
p5_script="$(generate_phase5_script)"

pos_sshd_t=$(printf "%s" "$p5_script" | grep -n "sshd -t" | head -n1 | cut -d: -f1)
pos_reload=$(printf "%s" "$p5_script" | grep -n "^systemctl reload ssh" | head -n1 | cut -d: -f1)
pos_p5_rollback=$(printf "%s" "$p5_script" | grep -n "^systemd-run.*ssh" | head -n1 | cut -d: -f1)

if [[ -n "$pos_sshd_t" && -n "$pos_reload" && "$pos_sshd_t" -lt "$pos_reload" ]]; then
  pass "P5: 'sshd -t' precedes 'systemctl reload ssh'"
else
  fail "P5 verification ordering" "sshd -t must precede systemctl reload ssh (sshd -t: $pos_sshd_t, reload: $pos_reload)"
fi

if [[ -n "$pos_p5_rollback" && -n "$pos_reload" && "$pos_p5_rollback" -lt "$pos_reload" ]]; then
  pass "P5: systemd-run rollback is scheduled before 'systemctl reload ssh'"
else
  fail "P5 rollback scheduling" "systemd-run rollback must precede systemctl reload ssh (rollback: $pos_p5_rollback, reload: $pos_reload)"
fi

# ------------------------------------------------------------------------------
# Test 7: P6 Swap Guard
# ------------------------------------------------------------------------------
echo "--- Testing P6 Swap Guards ---"

p6_script="$(generate_phase6_script 2)"
if [[ "$p6_script" == *"-e /swapfile"* || "$p6_script" == *"-f /swapfile"* ]]; then
  pass "P6 script checks for existing /swapfile"
else
  fail "P6 swap guard" "P6 does not check for existing /swapfile"
fi

if printf "%s\n" "$p6_script" | grep -q "exit 1"; then
  pass "P6 script aborts if /swapfile exists"
else
  fail "P6 swap abort" "P6 must exit 1 if /swapfile exists"
fi

# ------------------------------------------------------------------------------
# Test 8: Forbidden Patterns (no sshpass, no StrictHostKeyChecking=no, no password read)
# ------------------------------------------------------------------------------
echo "--- Testing Forbidden Patterns in Driver and Generated Scripts ---"

all_code="$(cat "$DRIVER")"
for item in "${phases[@]}"; do
  all_code+=$'\n'"${item#*:}"
done

# Check sshpass
if printf "%s" "$all_code" | grep -qi "sshpass"; then
  fail "Forbidden tool: sshpass" "Found occurrence of sshpass"
else
  pass "No occurrence of sshpass"
fi

# Check StrictHostKeyChecking=no
if printf "%s" "$all_code" | grep -qi "StrictHostKeyChecking=no"; then
  fail "Forbidden flag: StrictHostKeyChecking=no" "Found StrictHostKeyChecking=no"
else
  pass "No occurrence of StrictHostKeyChecking=no"
fi

# Check password reading via read command
if printf "%s" "$all_code" | grep -E "read.*(-p|-s).*password" | grep -v "#"; then
  fail "Forbidden pattern: password reading via read" "Found read command reading a password"
else
  pass "No script uses 'read' to capture passwords"
fi

# ------------------------------------------------------------------------------
# Test 9: Bash 3.2 Compatibility (no declare -A, no mapfile, no ${var,,})
# ------------------------------------------------------------------------------
echo "--- Testing Bash 3.2 Compatibility in Driver ---"

driver_code="$(cat "$DRIVER")"

if printf "%s" "$driver_code" | grep -qE "declare -[An]"; then
  fail "Bash 3.2 compatibility" "Found 'declare -A' or 'declare -n'"
else
  pass "No 'declare -A' or 'declare -n' in driver"
fi

if printf "%s" "$driver_code" | grep -qE "mapfile|readarray"; then
  fail "Bash 3.2 compatibility" "Found 'mapfile' or 'readarray'"
else
  pass "No 'mapfile' or 'readarray' in driver"
fi

if printf "%s" "$driver_code" | grep -qE '\$\{[a-zA-Z0-9_]+,,|\$\{[a-zA-Z0-9_]+\^\^'; then
  fail "Bash 3.2 compatibility" "Found case modification syntax \${var,,} or \${var^^}"
else
  pass "No case modification syntax \${var,,} or \${var^^} in driver"
fi

# ------------------------------------------------------------------------------
# Test 10: D1 - Rollback Timer Cancellation Safety and TTY
# ------------------------------------------------------------------------------
echo "--- Testing D1: Rollback Timer Cancellation Safety & TTY ---"

# P4 rollback cancellation must use ssh -t and not mask errors with '; true' or '|| true'
if grep -B 5 "Cancelando el temporizador de rollback de UFW" -A 10 "$DRIVER" | grep -q "ssh -t.*-i"; then
  pass "D1: P4 rollback cancellation uses 'ssh -t'"
else
  fail "D1: P4 rollback cancellation" "Must use 'ssh -t' to allocate a TTY for sudo"
fi

if grep -A 8 "Cancelando el temporizador de rollback de UFW" "$DRIVER" | grep -qE "(;[[:space:]]*true|\|\|[[:space:]]*true)"; then
  fail "D1: P4 rollback cancellation error masking" "Must NOT mask cancellation errors with '; true' or '|| true'"
else
  pass "D1: P4 rollback cancellation does not mask errors with '; true' or '|| true'"
fi

# P4 must verify that the timer is inactive (! systemctl is-active --quiet)
if grep -A 8 "Cancelando el temporizador de rollback de UFW" "$DRIVER" | grep -q "!.*systemctl is-active --quiet ufw-bootstrap-rollback\.timer"; then
  pass "D1: P4 cancellation verifies timer is inactive"
else
  fail "D1: P4 cancellation verification" "Must verify timer is inactive with '! systemctl is-active --quiet ufw-bootstrap-rollback.timer'"
fi

# P5 rollback cancellation must use ssh -t and not mask errors
if grep -B 5 "Cancelando el temporizador de rollback de SSH" -A 10 "$DRIVER" | grep -q "ssh -t.*-i"; then
  pass "D1: P5 rollback cancellation uses 'ssh -t'"
else
  fail "D1: P5 rollback cancellation" "Must use 'ssh -t' to allocate a TTY for sudo"
fi

if grep -A 8 "Cancelando el temporizador de rollback de SSH" "$DRIVER" | grep -qE "(;[[:space:]]*true|\|\|[[:space:]]*true)"; then
  fail "D1: P5 rollback cancellation error masking" "Must NOT mask cancellation errors with '; true' or '|| true'"
else
  pass "D1: P5 rollback cancellation does not mask errors with '; true' or '|| true'"
fi

if grep -A 8 "Cancelando el temporizador de rollback de SSH" "$DRIVER" | grep -q "!.*systemctl is-active --quiet sshd-bootstrap-rollback\.timer"; then
  pass "D1: P5 cancellation verifies timer is inactive"
else
  fail "D1: P5 cancellation verification" "Must verify timer is inactive with '! systemctl is-active --quiet sshd-bootstrap-rollback.timer'"
fi

# P4 must perform a separate key-only connectivity proof before cancellation
if grep -B 15 "Cancelando el temporizador de rollback de UFW" "$DRIVER" | grep -q 'ssh -i "\$key_path"'; then
  pass "D1: P4 performs key-only login check before cancellation"
else
  fail "D1: P4 connectivity check" "Must verify key-only connection before attempting cancellation"
fi

# ------------------------------------------------------------------------------
# Test 11: D2 - Idempotent re-run cleanup before systemd-run
# ------------------------------------------------------------------------------
echo "--- Testing D2: Re-run cleanup before systemd-run ---"

p4_script="$(generate_phase4_script)"
if printf "%s" "$p4_script" | grep -B 5 "systemd-run.*ufw-bootstrap-rollback" | grep -q "systemctl stop ufw-bootstrap-rollback\.timer"; then
  pass "D2: P4 stops stale timer before systemd-run"
else
  fail "D2: P4 stale unit cleanup" "Must stop ufw-bootstrap-rollback.timer before systemd-run"
fi

if printf "%s" "$p4_script" | grep -B 5 "systemd-run.*ufw-bootstrap-rollback" | grep -q "systemctl reset-failed ufw-bootstrap-rollback"; then
  pass "D2: P4 resets failed units before systemd-run"
else
  fail "D2: P4 stale unit cleanup" "Must reset-failed ufw-bootstrap-rollback before systemd-run"
fi

p5_script="$(generate_phase5_script)"
if printf "%s" "$p5_script" | grep -B 5 "systemd-run.*sshd-bootstrap-rollback" | grep -q "systemctl stop sshd-bootstrap-rollback\.timer"; then
  pass "D2: P5 stops stale timer before systemd-run"
else
  fail "D2: P5 stale unit cleanup" "Must stop sshd-bootstrap-rollback.timer before systemd-run"
fi

if printf "%s" "$p5_script" | grep -B 5 "systemd-run.*sshd-bootstrap-rollback" | grep -q "systemctl reset-failed sshd-bootstrap-rollback"; then
  pass "D2: P5 resets failed units before systemd-run"
else
  fail "D2: P5 stale unit cleanup" "Must reset-failed sshd-bootstrap-rollback before systemd-run"
fi

# ------------------------------------------------------------------------------
# Test 12: D3 - Authoritative SSH Rejection Tests
# ------------------------------------------------------------------------------
echo "--- Testing D3: Authoritative SSH Rejection Tests ---"

# (a) P5 script asserts sshd -T reports exact 4 directives and exits non-zero otherwise
p5_script="$(generate_phase5_script)"
if printf "%s" "$p5_script" | grep -q "sshd -T" && \
   printf "%s" "$p5_script" | grep -q 'permitrootlogin' && \
   printf "%s" "$p5_script" | grep -q 'passwordauthentication' && \
   printf "%s" "$p5_script" | grep -q 'kbdinteractiveauthentication' && \
   printf "%s" "$p5_script" | grep -q 'pubkeyauthentication' && \
   printf "%s" "$p5_script" | grep -q 'exit 1'; then
  pass "D3: P5 script asserts sshd -T exact directives on server and fails if mismatch"
else
  fail "D3: Server sshd -T assertion" "P5 script must assert exact sshd -T directives on server and exit 1 on mismatch"
fi

# (b) Driver tests client rejection with NumberOfPasswordPrompts=0 and checks offered methods
if grep -q "NumberOfPasswordPrompts=0" "$DRIVER"; then
  pass "D3: Driver uses NumberOfPasswordPrompts=0 for password rejection test"
else
  fail "D3: Password rejection test" "Driver must use NumberOfPasswordPrompts=0"
fi

if grep -q "PreferredAuthentications=password,keyboard-interactive" "$DRIVER"; then
  pass "D3: Driver specifies PreferredAuthentications=password,keyboard-interactive"
else
  fail "D3: Password rejection test" "Driver must specify PreferredAuthentications=password,keyboard-interactive"
fi

if grep -A 25 "NumberOfPasswordPrompts=0" "$DRIVER" | grep -q "Permission denied (publickey)"; then
  pass "D3: Driver verifies stderr contains 'Permission denied (publickey)'"
else
  fail "D3: Rejection verification" "Driver must verify server offers only publickey"
fi

if grep -A 25 "NumberOfPasswordPrompts=0" "$DRIVER" | grep -qE "(password|keyboard-interactive)"; then
  pass "D3: Driver rejects if password or keyboard-interactive is offered"
else
  fail "D3: Rejection verification" "Driver must fail if password or keyboard-interactive appears in offered methods"
fi

# ------------------------------------------------------------------------------
# Test 13: D4 - P4 Ordering: allow OpenSSH before default deny incoming
# ------------------------------------------------------------------------------
echo "--- Testing D4: P4 Rule Ordering ---"

p4_script="$(generate_phase4_script)"
pos_allow=$(printf "%s" "$p4_script" | grep -n "ufw allow OpenSSH" | head -n1 | cut -d: -f1)
pos_deny=$(printf "%s" "$p4_script" | grep -n "ufw default deny incoming" | head -n1 | cut -d: -f1)

if [[ -n "$pos_allow" && -n "$pos_deny" && "$pos_allow" -lt "$pos_deny" ]]; then
  pass "D4: 'ufw allow OpenSSH' precedes 'ufw default deny incoming'"
else
  fail "D4: Rule ordering" "ufw allow OpenSSH must precede ufw default deny incoming (allow: $pos_allow, deny: $pos_deny)"
fi

# ------------------------------------------------------------------------------
# Test 14: Driver-Wide TTY and Masking Audit
# ------------------------------------------------------------------------------
echo "--- Testing Driver-Wide TTY & Error Masking Audit ---"

# Gate G2: sudo whoami must use ssh -t
if grep -B 6 "sudo whoami" "$DRIVER" | grep -q "ssh -t"; then
  pass "Audit: Gate G2 'sudo whoami' uses ssh -t"
else
  fail "Audit: Gate G2 TTY" "Gate G2 'sudo whoami' must use ssh -t so sudo has a TTY"
fi

# Reboot command must use ssh -t
if grep -B 6 "sudo systemctl reboot" "$DRIVER" | grep -q "ssh -t"; then
  pass "Audit: Remote reboot command uses ssh -t"
else
  fail "Audit: Reboot TTY" "Remote reboot command must use ssh -t"
fi

# Local alias: an existing multi-name Host line must be detected (POSIX ERE,
# no \b), and IdentityFile must be portable (~/...) for Windows OpenSSH too.
alias_home="$(mktemp -d)"
mkdir -p "${alias_home}/.ssh"
printf 'Host other contabo-vps\n    HostName 203.0.113.10\n' > "${alias_home}/.ssh/config"
(HOME="$alias_home" configure_local_ssh_alias 203.0.113.10 deploy contabo-vps "${alias_home}/.ssh/contabo-vps_ed25519" >/dev/null)
if [ "$(grep -c 'contabo-vps' "${alias_home}/.ssh/config")" -eq 1 ]; then
  pass "Alias: existing multi-name Host entry is not duplicated"
else
  fail "Alias: duplicate" "Existing alias was appended again"
fi
printf 'Host unrelated\n' > "${alias_home}/.ssh/config"
(HOME="$alias_home" configure_local_ssh_alias 203.0.113.10 deploy contabo-vps "${alias_home}/.ssh/contabo-vps_ed25519" >/dev/null)
if grep -qx '    IdentityFile ~/.ssh/contabo-vps_ed25519' "${alias_home}/.ssh/config"; then
  pass "Alias: IdentityFile is written as a portable ~/ path"
else
  fail "Alias: IdentityFile" "Expected '    IdentityFile ~/.ssh/contabo-vps_ed25519'"
fi
rm -rf "$alias_home"

# Reboot wait must prove a new boot, not just a reachable SSH port.
if grep -q 'boot_id' "$DRIVER" && ! grep -q 'sudo systemctl reboot" 2>/dev/null || true' "$DRIVER"; then
  pass "Audit: reboot wait compares boot_id and does not mask the reboot command"
else
  fail "Audit: reboot detection" "Reboot wait must compare boot_id and must not hide reboot errors"
fi

# Interactive ssh -t output must never be captured: the sudo prompt would be
# hidden from the person and mixed into the captured value.
if grep -qE '\$\(ssh -t' "$DRIVER"; then
  fail "Audit: no captured ssh -t" "Output of an interactive ssh -t session is captured with \$(...)"
else
  pass "Audit: interactive ssh -t output is never captured"
fi

# Gate G2 must decide on the remote exit status, not on captured text.
if grep -qF 'test "$(sudo whoami)" = root' "$DRIVER"; then
  pass "Audit: Gate G2 checks sudo through the remote exit status"
else
  fail "Audit: Gate G2 exit status" "Gate G2 must run 'test \"\$(sudo whoami)\" = root' remotely"
fi

# Cancelling a rollback must be judged only by the timer being inactive:
# reset-failed on an already collected transient unit returns non-zero.
for unit in ufw-bootstrap-rollback sshd-bootstrap-rollback; do
  if grep -qF "reset-failed ${unit}.timer ${unit}.service 2>/dev/null &&" "$DRIVER"; then
    fail "Audit: ${unit} cancellation" "reset-failed result must not decide cancellation"
  elif grep -qF "! systemctl is-active --quiet ${unit}.timer" "$DRIVER"; then
    pass "Audit: ${unit} cancellation is verified by timer inactivity"
  else
    fail "Audit: ${unit} cancellation" "Missing timer inactivity verification"
  fi
done

# ------------------------------------------------------------------------------
# Summary
# ------------------------------------------------------------------------------
echo "=========================================="
echo "Tests passed: $PASSED"
echo "Tests failed: $FAILED"
echo "=========================================="

if [[ "$FAILED" -gt 0 ]]; then
  exit 1
fi

exit 0
