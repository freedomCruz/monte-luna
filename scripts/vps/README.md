# Ubuntu 24.04 VPS Hardening & Bootstrap

Guided, safe, and idempotent bootstrap script for hardening a fresh Ubuntu 24.04 LTS VPS (tested and verified on Contabo VPS instances).

The script automates the manual hardening baseline documented in `odd/tasks/vps-hardening-v1.md`, guiding you step-by-step from your local machine without requiring external dependencies, agents, or third-party tools.

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Contabo VNC Recovery Setup](#contabo-vnc-recovery-setup)
3. [Quick Start](#quick-start)
4. [Phases and Security Gates](#phases-and-security-gates)
5. [Idempotency and Re-runs](#idempotency-and-re-runs)
6. [Rollback Procedures](#rollback-procedures)
7. [Known Provider Findings](#known-provider-findings)
8. [Testing](#testing)

---

## Prerequisites

### Local Environment
- **Operating System:** Linux, macOS (Bash 3.2+ compatible), or Windows (via Git Bash or WSL).
- **Required local binaries:**
  - `bash` (v3.2 or later)
  - `ssh`, `ssh-keygen`, `ssh-agent`, `ssh-add` (OpenSSH client)
  - `base64` (standard coreutils)

*Note: The script deliberately requires no additional tools like `sshpass`, Python, Ansible, or external packages.*

### Remote Server
- A fresh **Ubuntu 24.04 LTS** VPS instance.
- Initial `root` password provided by the hosting provider upon provisioning.
- Public IP address (e.g., `203.0.113.10`).

---

## Contabo VNC Recovery Setup

Before applying firewall rules or disabling password authentication on SSH, you **must** ensure an independent console access channel is functional to prevent accidental lockout.

1. **Access the Contabo Customer Control Panel (CCP):**
   - Navigate to **VPS Control** -> select your instance -> **VNC**.
2. **Set a VNC Password:**
   - Click **Set VNC Password** (`Establecer contraseña`), enter a strong password, and click **Confirm** (`Confirmar`).
   - Note the assigned VNC IP and Port (typically `5900 + display number`).
3. **Download TigerVNC Viewer:**
   - Download the official standalone **TigerVNC Viewer** (v1.16.2+ recommended) for your operating system.
4. **Test the Console Connection:**
   - Open TigerVNC Viewer and connect to `<VNC_IP>:<VNC_PORT>`.
   - Enter your VNC password.
   - Verify that the terminal responds and displays the Ubuntu login prompt (`login:`).
5. **Security notice:**
   - VNC transmits unencrypted keyboard and screen buffers over the public internet. Use it strictly for out-of-band emergency recovery, protect it with a unique password, and do not use it for routine administration.

---

## Quick Start

1. Clone the repository and navigate to the project directory:
   ```bash
   cd /path/to/ecommerce
   ```

2. Run the bootstrap script:
   ```bash
   bash scripts/vps/bootstrap-ubuntu-vps.sh
   ```

3. Follow the interactive prompts (in Spanish):
   - **Dirección del servidor:** `203.0.113.10`
   - **Nombre del usuario administrador:** `monteluna` (or your chosen non-root user)
   - **Alias SSH local:** `contabo-vps` (default)
   - **Ruta de la clave SSH:** `~/.ssh/contabo-vps_ed25519` (default)
   - **Tamaño de swap en GiB:** `2` (default, `0` to disable)

4. When prompted:
   - Enter a passphrase for your new local SSH key (or reuse an existing key).
   - Enter the temporary provider `root` password for the initial setup.
   - Set the password for the new administrative user.
   - Confirm VNC console availability by typing `si` at Gate G1.

5. Connect to your hardened server using the configured alias:
   ```bash
   ssh contabo-vps
   ```

---

## Phases and Security Gates

| Phase / Gate | Description | Safety Mechanisms |
|---|---|---|
| **P0: Inputs** | Validates local tools (`ssh`, `ssh-keygen`, `base64`, etc.) and inputs (IP/hostname, username, alias, swap). | Aborts immediately on invalid format or missing local binary. |
| **P1: SSH Key** | Generates an Ed25519 key (`ssh-keygen -t ed25519 -a 100`) or reuses an existing key; starts local `ssh-agent`. | Never overwrites an existing key. `ssh-agent` is automatically terminated on exit via `trap`. |
| **P2: Root Setup** | Connects as root using the provider password. Validates Ubuntu 24.04 from `/etc/os-release`, creates the admin user, adds to `sudo`, sets user password with `passwd`, and installs the public key with permissions `700` (`.ssh`) and `600` (`authorized_keys`). | Aborts if OS is not Ubuntu 24.04. Existing user is preserved and key appended only if absent. |
| **Gate G2** | Verifies key-only authentication (`PasswordAuthentication=no`) and tests `sudo whoami`. | Hard stop: If key login or `sudo` returns anything other than `root`, execution halts before making any lockout-sensitive change. |
| **Gate G1** | Prompts user to confirm that Contabo VNC console is reachable and shows the login prompt. | Hard stop: Requires typing `si` to proceed to firewall and SSH hardening. |
| **P3: Updates** | Runs `apt-get update`, simulates upgrade, and applies non-interactive package updates respecting Ubuntu's phased updates. | Checks `/var/run/reboot-required`. If required, prompts before rebooting and polls for up to 5 minutes until SSH returns. |
| **P4: UFW** | Installs UFW if absent, enables IPv6, allows `OpenSSH` first, then sets `default deny incoming` and `default allow outgoing`. | **Dead-man switch:** Schedules a 5-minute rollback (`systemd-run ... ufw disable`) *before* enabling UFW. The timer is cancelled only after a new local key login succeeds, and the cancellation counts only when the timer is verified inactive; otherwise the script stops and warns that the rollback will run. |
| **P5: SSH Hardening** | Writes `/etc/ssh/sshd_config.d/00-bootstrap-hardening.conf` disabling root login and password authentication. | Tests syntax with `sshd -t` and the effective values with `sshd -T` before reloading. Schedules a 5-minute rollback timer. Cancels it only after verifying: (1) key login works, (2) a password-only login is refused with `Permission denied (publickey)`, and (3) a root login is refused the same way; the cancellation is verified like in P4. |
| **P6: Swap** | Creates `/swapfile` (mode `600`, root-owned), activates swap, backs up `/etc/fstab`, appends entry once, sets `vm.swappiness=10`, and executes `systemctl daemon-reload`. | Refuses execution if `/swapfile` already exists. Skipped if swap size is set to `0`. |
| **P7: Cloud-Init** | Reads `cloud-init status --long` and displays informational diagnosis without modifying cloud-init configuration. | Read-only. Does not attempt destructive fixes (`cloud-init clean`). |
| **P8: Readback** | Comprehensive read-only audit verifying kernel, NTP, SSH options, UFW rules, port 22 binding, clean units, swap, pending updates, and CPU SRSO status. | Exits non-zero if any required check fails. |
| **P9: SSH Alias** | Configures `Host <alias>` in `~/.ssh/config` with keepalive options, creating a backup copy first. | Never overwrites an existing alias. |

---

## Idempotency and Re-runs

Every phase inspects the current state of the server and skips redundant actions:
- **SSH Keys:** If the key already exists locally, it displays the fingerprint and reuses it.
- **Admin User:** If the user already exists, it verifies membership in the `sudo` group and appends the public key only if not already present in `authorized_keys`.
- **System Updates:** Packages already up-to-date are skipped.
- **Firewall & SSH:** Existing rules and drop-ins are verified and safely re-applied.
- **Swap:** If `/swapfile` already exists, Phase 6 refuses to overwrite it to prevent data corruption. If re-running on a server where swap was already created, specify `0` GiB for swap size to skip Phase 6.

---

## Rollback Procedures

### Automatic Dead-Man Switch Rollbacks
During execution, both UFW activation (P4) and SSH daemon reload (P5) arm a 5-minute rollback timer via `systemd-run`. If network connectivity is broken and the local machine cannot reconnect, systemd automatically executes:
- **UFW rollback:** `/usr/sbin/ufw disable`
- **SSH rollback:** `rm -f /etc/ssh/sshd_config.d/00-bootstrap-hardening.conf && systemctl reload ssh`

Once connectivity is verified from the local driver, the respective timers are disarmed and cleared.

### Manual Rollbacks (via VNC or SSH)
If you need to manually revert individual hardening steps:

1. **Revert SSH Hardening (re-enable password / root access):**
   ```bash
   sudo rm -f /etc/ssh/sshd_config.d/00-bootstrap-hardening.conf
   sudo sshd -t && sudo systemctl reload ssh
   ```

2. **Disable Firewall (UFW):**
   ```bash
   sudo ufw disable
   ```

3. **Remove Swap:**
   ```bash
   sudo swapoff /swapfile
   sudo rm -f /swapfile
   sudo cp /etc/fstab.bak-bootstrap /etc/fstab
   sudo rm -f /etc/sysctl.d/99-bootstrap-swap.conf
   sudo sysctl --system
   sudo systemctl daemon-reload
   ```

4. **Restore Local SSH Config:**
   ```bash
   cp ~/.ssh/config.bak-bootstrap ~/.ssh/config
   ```

---

## Known Provider Findings

During verified manual testing on Contabo Ubuntu 24.04 VPS instances, two vendor-specific characteristics were identified:

### 1. Cloud-Init `bootcmd` Failure
- **Observation:** `cloud-init status` reports `status: error`.
- **Root Cause:** Contabo's NoCloud provisioning image includes a user-data `bootcmd` script that calls deprecated commands (such as `chpasswd.list`) and exits with status 1.
- **Recommendation:** Do **not** run `cloud-init clean`, disable the service, or attempt to modify `/etc/cloud/`. The cloud-init network configuration and disk partitioning have already succeeded during first boot. Remediation should be requested through Contabo support tickets.

### 2. CPU Speculative Return Stack Overflow (SRSO)
- **Observation:** `/sys/devices/system/cpu/vulnerabilities/spec_rstack_overflow` reports `Vulnerable: Safe RET, no microcode`.
- **Root Cause:** The virtualization hypervisor host has not provided updated AMD CPU microcode to the virtual guest.
- **Recommendation:** This vulnerability cannot be patched inside the guest container/VM kernel. It requires microcode updates on Contabo's physical hypervisor hosts. Keep services isolated and request host microcode remediation prior to exposing the server to untrusted multi-tenant workloads.

---

## Testing

The bootstrap suite includes an automated unit and validation test runner:

```bash
bash scripts/vps/test-bootstrap-ubuntu-vps.sh
```

The test runner verifies:
1. Driver script syntax and Bash 3.2 compatibility (no associative arrays, `mapfile`, or `${var,,}`).
2. Public input validators for server address (IPv4, IPv6, Hostname), username, alias, and swap size.
3. Syntax check (`bash -n`) on every generated remote phase script.
4. Exact content of the SSH hardening drop-in file (`PermitRootLogin no`, `PasswordAuthentication no`, `KbdInteractiveAuthentication no`, `PubkeyAuthentication yes`).
5. Execution ordering: `ufw allow OpenSSH` precedes `ufw enable`, and rollback timers are armed before reloads.
6. Swap safety checks: refuses existing `/swapfile`.
7. Absence of forbidden patterns (`sshpass`, `StrictHostKeyChecking=no`, and `read -p ... password`).
