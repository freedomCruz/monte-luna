# Feature: VPS hardening v1

Safely prepare the provisioned Contabo VPS for later deployment without losing administrative access. No application deployment, domain configuration, Docker installation, or production secrets are in scope until their separate gates are resolved.

## Specs

### S1: Perform the initial configuration safely
> "hagamos esas primera configuraciones de acuerdo"

Every remote mutation is executed as a small reversible step. The existing root session remains open until a separate session proves non-root key authentication and `sudo`; root/password SSH access is never disabled before that proof.

### S2: Administrative account
> "monteluna"

Create the non-root administrative account `monteluna`, grant only the required `sudo` access, install a user-controlled SSH public key, and verify access from a second terminal before changing SSH policy.

### S3: Current and recovery access
> "Con contraseña"
>
> "No lo he verificado"

The current root access depends on a password, and Contabo console/recovery access is not yet verified. Root/password authentication and firewall policy remain unchanged until recovery access is confirmed and the `monteluna` key-authenticated session is proven.

## Tasks

| ID | Task | Specs | Route | Commit |
| --- | --- | --- | --- | --- |
| T1 | Record the observed host baseline, hardening blockers, safety gates, and recovery constraints | S1–S3 | coordinator | f02d4e2 |
| G1 | Gate: user verifies Contabo console or recovery access | S1, S3 | user | passed (L9); VNC remains enabled during hardening |
| T2 | Generate or select a dedicated local SSH key without disclosing private key material | S1–S3 | user + coordinator | fingerprint verified; f02d4e2 |
| T3 | Create `monteluna`, install its public key, grant sudo, and preserve the existing root session | S1–S3 | user + coordinator | verified on host; f02d4e2 |
| G2 | Gate: second terminal proves `monteluna` key login and sudo before any lockout-sensitive change | S1–S3 | user | passed (L6) |
| T4 | Apply pending Ubuntu updates, reboot when required, and re-run time, services, kernel, and CPU mitigation checks | S1 | user + coordinator | passed (L10); f02d4e2 |
| T5 | Configure the host firewall while preserving verified SSH access; keep application/database ports private | S1–S3 | user + coordinator | passed (L11); f02d4e2 |
| T6 | Harden SSH by disabling password and direct root login only after G1 and G2; verify another fresh session | S1–S3 | user + coordinator | passed (L12); f02d4e2 |
| T7 | Diagnose or document the cloud-init and network-wait failures without exposing provisioning secrets | S1 | user + coordinator | documented (L14); provider remediation pending |
| T8 | Decide swap policy from measured resource behavior; Docker and deployment remain separate audited work | S1 | coordinator + user | passed (L16); f02d4e2 |
| V1 | Read back effective SSH/firewall/services state and verify recovery, access, updates, and exposure invariants | S1–S3 | coordinator | passed (L17); f02d4e2 |

## Allowed edit surfaces

- Repository: `docs/architecture/infrastructure.md`, `odd/tasks/vps-hardening-v1.md`.
- VPS: only the explicitly named account, SSH, firewall, package-update, time, and failed-service checks in the active task.
- Forbidden: application deployment, Docker installation, DNS changes, secret files, PostgreSQL, production data, destructive resets, publishing credentials, closing the original root session before G2, or changing SSH/firewall policy before its gates.

## Log

- L1 (user): "hagamos esas primera configuraciones de acuerdo"
- L2 (user decisions): administrative account `monteluna`; current root access is "Con contraseña"; Contabo console/recovery access is "No lo he verificado".
- L3 (coordinator): The server baseline shows Ubuntu 24.04.5 LTS, NTP synchronized, three pending updates, unattended upgrades active, UFW inactive, SSH listening on all assigned IPv4/IPv6 with direct root and password authentication enabled, Docker absent, cloud-init and network-wait failed units, no swap, and a kernel-reported Spec rstack overflow warning. Hardening proceeds interactively and fail-closed; no server mutation has been executed yet.
- L4 (coordinator): T1 complete in the working tree after `git diff --check` passed. The canonical infrastructure document intentionally excludes hostname, machine ID, boot ID, and public IP. No commit was created because the user did not request one.
- L5 (user, T2): Generated the dedicated Ed25519 key and reported fingerprint `SHA256:ZBeyL//A1f8NiOAjzIT44lhVmcLyccLg0GbuAVIOY1U` with comment `monteluna-vps-2026`. The private key and passphrase were not disclosed. T2 complete; T3 starts without changing SSH or firewall policy.
- L6 (user, T3/G2): The installed `authorized_keys` file reported the same Ed25519 fingerprint, owner `monteluna:monteluna`, and mode `600`. A fresh second SSH session authenticated with the dedicated key as `monteluna`; `id` included `sudo`; `.ssh` and `authorized_keys` permissions matched `700` and `600`; `sudo whoami` returned `root`. The original root session remained open. T3 complete and G2 passed. No SSH or firewall policy has been changed.
- L7 (user, G1): Contabo dashboard shows VNC enabled. The authorized screenshot was redacted correctly and shows a separate `Establecer contraseña` action plus `Confirmar`; no VNC address or credential was persisted. G1 remains open until a unique VNC password is set and a console session reaches the host login prompt independently of SSH.
- L8 (coordinator, dependency audit): Contabo's official guide requires a separate VNC viewer, recommends UltraVNC, and warns that VNC is less secure than SSH and should be used only for recovery. Compared UltraVNC 1.8.3.0 (September 2026, GPL-3.0-or-later, official portable ZIP SHA-256 `11163a0b9b86321bf6403eb0cf84b81f7230ce32e6291377e1fe5beb987f7e4f`, recent viewer/security hardening) with TigerVNC 1.16.2 (2026-03-26, GPL-2.0, active; 1.16.2 fixes an x0vncserver issue rather than a viewer issue). UltraVNC portable viewer is recommended because Contabo documents it and the vendor publishes a checksum; download/use still requires user approval. Do not install or start a local VNC server.
- L9 (user, G1): UltraVNC's official download server failed, so the user authorized the official standalone TigerVNC Viewer 1.16.2 x64. The downloaded binary matched the SourceForge-published size (`24072224`) and MD5 (`62d89206d118deed93b7df651499b456`), had SHA-256 `58396d99556026da6b906c9ed51ad6cb5c840cc3fb65e53653c52ca5a80bfad9`, and carried a valid Authenticode signature from `Open Source Developer, Brian Hinz`. The viewer reached the Ubuntu login prompt and accepted the `monteluna` username, proving the independent console path. G1 passed. Contabo enables VNC by default and disabling it requires a restart, so it remains enabled and protected by its unique password during the hardening/reboot window.
- L10 (user, T4): The user authorized controlled Ubuntu updates and a reboot only if required. Package simulation upgraded `distro-info-data` and respected Ubuntu's phased deferral of `cloud-init` 26.2. Ubuntu required reboot for `linux-image-6.8.0-147-generic` and `linux-base`; the host returned on kernel `6.8.0-147-generic`, key-authenticated `monteluna` SSH and sudo remained functional, NTP reported synchronized, and no further reboot was required. `systemd-networkd-wait-online.service` cleared; only `cloud-init.service` remains failed for T7. The post-reboot CPU status remains `Vulnerable: Safe RET, no microcode`, so provider escalation is required before production traffic. T4 passed.
- L11 (user, T5): The user authorized an SSH-only UFW policy. UFW was already installed with IPv6 enabled and an OpenSSH profile limited to TCP/22. The firewall was enabled with logging `low`, default deny incoming, default allow outgoing, routed traffic disabled, and only OpenSSH allowed on IPv4 and IPv6. Two existing sessions remained open and a third fresh connection authenticated by key as `monteluna`, proving SSH continuity. Application and database ports remain private. T5 passed.
- L12 (user, T6): The user authorized key-only SSH hardening. Effective configuration inspection found `50-cloud-init.conf` enabled password authentication before `60-cloudimg-settings.conf` disabled it, so the validated `00-monteluna-hardening.conf` takes first-value precedence and sets `PermitRootLogin no`, `PasswordAuthentication no`, `KbdInteractiveAuthentication no`, and `PubkeyAuthentication yes`. `sshd -t` passed, the SSH service remained active after reload, a fresh key-authenticated `monteluna` session and sudo succeeded, a password-only client attempt was rejected with only `publickey` offered, and a direct root key attempt was rejected. Existing sessions and VNC recovery remained available. T6 passed.
- L13 (independent verifier, T5–T6): A read-only verifier using `aveento/gemini-3.8-flash-high` returned PASS for S1–S3 across T5 and T6, finding no severe gap in the recorded UFW, SSH, sudo, and VNC recovery evidence. It correctly distinguished that formal live host readback remains assigned to V1 and identified a stale scope-status sentence in the canonical infrastructure document; that sentence was corrected to state that hardening is in progress.
- L14 (user, T7): Read-only diagnostics confirmed `cloud-init.service` fails because the provider-supplied NoCloud user-data `bootcmd` script exits with status 1. The supplied user-data and network configuration pass schema validation, but the provider data uses deprecated `chpasswd.list`. No repository or `/etc/cloud` file declares the failing `bootcmd`; raw provisioning data was not inspected or persisted because it may contain credentials. The prior network-wait failure cleared after T4's reboot. T7 is documented rather than mutated: do not rerun, clean, reset, or disable cloud-init; request Contabo remediation before production.
- L15 (user, T8 measurements): Idle post-hardening sample with no application services: 7.8 GiB RAM total, 418 MiB used, 7.3 GiB available; no swap configured; root filesystem 96 GB with 2.3 GB used (3%); memory PSI `some` and `full` averages 0.00; `vmstat` showed no swap activity, no I/O wait, and ~100% idle CPU; no kernel OOM events this boot. The baseline does not show memory pressure, but it does not represent PostgreSQL, Go, Caddy, image loads, migrations, or `pg_dump` load.
- L16 (user, T8): After an explanation of swap trade-offs, the user approved "si hagamoslo" for a 2 GiB swap file with `vm.swappiness=10`. The guarded block refused to overwrite an existing file, created `/swapfile` (root-owned, mode `600`, 2147483648 bytes), activated it, backed up `/etc/fstab` to `/etc/fstab.bak-swap`, appended `/swapfile none swap sw 0 0`, and applied swappiness through `/etc/sysctl.d/99-monteluna-swap.conf`. Readback showed 2.0 GiB swap with 0 B used and swappiness `10`. `findmnt --verify` reported 0 parse errors and 0 errors; its two warnings are expected (a regular-file swap source, and systemd not yet reloaded after the fstab edit). Persistence across reboot will be confirmed at the next planned reboot. T8 passed.
- L17 (user, V1): After `systemctl daemon-reload`, the final read-only readback showed kernel `6.8.0-147-generic` with NTP synchronized; SSH active with `permitrootlogin no`, `passwordauthentication no`, `kbdinteractiveauthentication no`, `pubkeyauthentication yes`, and the drop-in owned by `root:root` with mode `644`; UFW active with deny incoming, allow outgoing, routed disabled, and only OpenSSH TCP/22 on IPv4/IPv6; the only externally bound sockets are SSH on `0.0.0.0:22` and `[::]:22`, with DNS resolver sockets on loopback only; the only failed unit is the documented provider `cloud-init.service`; `/swapfile` 2 GiB active through `swapfile.swap` with swappiness `10`; only phased `cloud-init` 26.2 pending; no reboot required; unattended upgrades active. VNC recovery remains verified (L9). V1 passed. Open provider follow-ups before production: Contabo remediation for the NoCloud `bootcmd` failure and the missing CPU microcode mitigation for Spec rstack overflow; swap persistence is confirmed at the next planned reboot.
- L18 (user): "redacta los tickets y envía commits y paramos por ahora". Documentation committed locally as `f02d4e2` on `feat/vps-hardening-v1`; no push or pull request was made. Contabo ticket drafts were provided in chat for the user to submit. Work paused at the user's request; next feature is `deploy-v1`.
