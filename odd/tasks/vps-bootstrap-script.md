# Feature: VPS bootstrap script

Turn the manual VPS hardening procedure verified in `odd/tasks/vps-hardening-v1.md` into one guided, re-runnable script that anyone can run from their own computer to prepare a fresh Contabo Ubuntu 24.04 VPS. Kept local on `feat/vps-hardening-v1`; not pushed until the user decides.

## Specs

### S1: Guided script instead of repeating manual steps
> "no quiero volver a repetir todos esos pasos para configurar un servidor. Entonces la idea es que me ayudes a crear un script con los paso a pasos y que la persona vaya dando las entradas de frase para el SSH local que vaya dando también su contraseña de servidor. Todo lo que tú me pediste que lo pueda hacer a través del script y que lo vaya llevando paso a paso para configurar un servidor en contado."

The script walks the person step by step through everything the manual procedure did: local SSH key with passphrase, first login with the server password, administrative user, sudo, updates and reboot, firewall, SSH hardening, swap, cloud-init check, and final verification. The person types the key passphrase and the server password at the interactive prompts.

### S2: Location and publication
> "Ese se puede alojar en la raíz del proyecto o en la carpeta que tú creas conveniente. No la subimos todavía al repo final, sino esa la vamos a subir ya cuando tengamos todo arriba y hayamos terminado esta parte, por terminado."

### S3: Usable by followers
> "le pegamos una revisada para que cualquier persona de los que están siguiéndome puedan correr ese script y subir un servidor en contabo."

### S4: User decisions (L2)
- Documentation and script stay on `feat/vps-hardening-v1`; local `main` is not modified.
- Platform: Bash, running from Git Bash (Windows), WSL, macOS, and Linux.
- Script messages and prompts are in Spanish; code, comments, tests, and README stay in English.

## Design (coordinator)

Coordinator decisions derived from the verified manual procedure. They do not add user requirements; they define how S1–S4 are met safely.

### Files

- `scripts/vps/bootstrap-ubuntu-vps.sh` — local driver; executable; sourcing it must not run `main` (`[[ "${BASH_SOURCE[0]}" == "$0" ]] && main "$@"`).
- `scripts/vps/test-bootstrap-ubuntu-vps.sh` — plain-Bash test runner, no new dependencies; exits non-zero on any failure.
- `scripts/vps/README.md` — English usage guide: prerequisites, Contabo VNC recovery setup with the official TigerVNC Viewer, what each phase changes, how to re-run, how to roll back each change, known provider findings (cloud-init `bootcmd`, CPU SRSO microcode).

### Execution model

- Runs locally; never needs `sshpass` or any new dependency: only `bash`, `ssh`, `ssh-keygen`, `ssh-agent`, `ssh-add`, `base64`, and core utilities.
- Compatible with Bash 3.2 (macOS default): no associative arrays, `mapfile`, `${var,,}`, or `declare -n`.
- Each remote phase is a generated Bash script sent as one base64 argument through `ssh -t`, written to a `mktemp` file, executed (`bash` as root in phase 1, `sudo bash` afterwards) so prompts keep the terminal, and deleted. Values embedded in generated scripts are quoted with `printf '%q'`.
- The server password is typed only at OpenSSH's own prompt during phase 1. The admin password is typed only at `passwd` and `sudo` prompts. No password is read by the script, stored, logged, placed in argv, or written to disk.
- The script starts its own `ssh-agent`, adds the key once (one passphrase prompt), and kills the agent on exit (`trap`).
- No log files. Re-running is safe: every phase reads the current state and skips work already done.

### Inputs (validated before any connection)

- Server address: IPv4, IPv6, or hostname.
- Admin username: `^[a-z][a-z0-9_-]{0,31}$`, never `root`; no default.
- SSH alias: default `contabo-vps`; same pattern as the username.
- Key path: default `~/.ssh/<alias>_ed25519`; reuse an existing key and show its fingerprint.
- Swap size in GiB: default `2`; `0` skips; maximum `8`.

### Phases and gates

| Phase | Action | Gate / safety |
|---|---|---|
| P0 | Check local tools; collect and validate inputs; show a summary and ask for confirmation | Abort on missing tool or invalid input |
| P1 | Create or reuse an Ed25519 key (`ssh-keygen -t ed25519 -a 100`; ssh-keygen prompts for the passphrase); print fingerprint | Never overwrite an existing key |
| P2 | Root login with server password: require Ubuntu 24.04 (`/etc/os-release`), create the admin user in group `sudo`, set its password with `passwd`, install the public key with `.ssh` `700` and `authorized_keys` `600` owned by the user; print the installed fingerprint | Abort if not Ubuntu 24.04; existing user reuses and appends the key only if absent |
| G2 | Fresh key-only login (`PasswordAuthentication=no`, `KbdInteractiveAuthentication=no`, `IdentitiesOnly=yes`) and `sudo whoami` returns `root` | Stop before any lockout-sensitive change if it fails |
| G1 | Explain how to enable Contabo VNC and test it with the official TigerVNC Viewer; require typing `si` to confirm the console reaches the login prompt | Stop before UFW and SSH changes without confirmation |
| P3 | `apt-get update`, show `--simulate upgrade`, upgrade non-interactively (`DEBIAN_FRONTEND=noninteractive`, `--force-confdef`, `--force-confold`); never bypass phased updates; if `/var/run/reboot-required` exists, ask, reboot, wait up to 5 minutes for SSH, print `uname -r` | Reboot only when required and confirmed |
| P4 | UFW: install from Ubuntu repositories only if missing, require `IPV6=yes`, `allow OpenSSH`, `default deny incoming`, `default allow outgoing`, then enable | Schedule a 5-minute `systemd-run` rollback (`ufw disable`) before enabling; cancel it only after a new local key login succeeds |
| P5 | Write `/etc/ssh/sshd_config.d/00-bootstrap-hardening.conf` (`PermitRootLogin no`, `PasswordAuthentication no`, `KbdInteractiveAuthentication no`, `PubkeyAuthentication yes`; `root:root`, `644`) so it wins OpenSSH's first-value rule over `50-cloud-init.conf`; `sshd -t`; confirm with `sshd -T`; reload `ssh` | Remove the file and abort if `sshd -t` fails; schedule a 5-minute rollback (remove drop-in, reload) before reload; cancel only after key login succeeds and both password-only and root logins are rejected |
| P6 | Swap: refuse if `/swapfile` exists; `fallocate`, `chmod 600`, `mkswap`, `swapon`, back up `/etc/fstab` to `/etc/fstab.bak-bootstrap`, append the entry once, `vm.swappiness=10` in `/etc/sysctl.d/99-bootstrap-swap.conf`, `systemctl daemon-reload` | Skipped when size is `0` |
| P7 | Read-only `cloud-init status` summary; explain that a provider `bootcmd` error is a provider issue and must not be "fixed" by cleaning, rerunning, or disabling cloud-init | Never mutate cloud-init |
| P8 | Final readback with a PASS/FAIL line per check: kernel, NTP, SSH active and the four effective values, UFW policy and rules, externally bound sockets limited to port 22, failed units, swap, pending updates, reboot-required, unattended upgrades, CPU vulnerability status (informational) | Exit non-zero if any required check fails |
| P9 | Offer to add a `Host <alias>` block (`HostName`, `User`, `IdentityFile`, `IdentitiesOnly yes`, `ServerAliveInterval 60`, `ServerAliveCountMax 3`) to `~/.ssh/config`, backing it up first; create the file with mode `600` if absent; skip if the alias exists; print `ssh <alias>` | Never overwrite an existing alias |

### Tests (RED first)

Through the script's public functions (sourced, `main` not run): input validators accept and reject the documented cases; every generated remote phase script passes `bash -n`; the P5 drop-in content is exact; in P4 `allow OpenSSH` precedes `enable` and the rollback is scheduled before `enable`; in P5 the rollback is scheduled before reload and `sshd -t` precedes reload; the P6 script refuses an existing `/swapfile`; no generated script or the driver uses `sshpass`, `StrictHostKeyChecking=no`, or reads a password with `read`.

## Tasks

| ID | Task | Specs | Route | Commit |
|---|---|---|---|---|
| T1 | Implement the driver, the test runner, and the README per Design | S1–S4 | worker + coordinator fixes | see L4–L6; commit recorded in L7 |
| V1 | Independent read-only review of security, lockout safety, and spec coverage | S1–S4 | verifier | passed (L5); findings fixed (L6) |
| A1 | Acceptance on a real fresh Ubuntu 24.04 VPS (user-run) | S1, S3 | user | pending |

## Log

- L1 (user): "ya se se enviaron los ticket. Bueno, tenemos trabajito ahora para la mañana. Ya compré el dominio Monteluna Co.com y vamos a mirar que vamos a hacer con la documentación que hicimos respecto a la configuración del servidor que está en esta rama. Entonces quiero que me digas. si es recomendable llevarla acá en local, en Main, no la voy a llevar al repositorio por si de pronto se coló alguna URL del servidor o alguna variable.También como segundo paso, no quiero volver a repetir todos esos pasos para configurar un servidor. Entonces la idea es que me ayudes a crear un script con los paso a pasos y que la persona vaya dando las entradas de frase para el SSH local que vaya dando también su contraseña de servidor. Todo lo que tú me pediste que lo pueda hacer a través del script y que lo vaya llevando paso a paso para configurar un servidor en contado. ¿Listo?Ese se puede alojar en la raíz del proyecto o en la carpeta que tú creas conveniente. No la subimos todavía al repo final, sino esa la vamos a subir ya cuando tengamos todo arriba y hayamos terminado esta parte, por terminado. Entonces le pegamos una revisada para que cualquier persona de los que están siguiéndome puedan correr ese script y subir un servidor en contabo. Ya los tickets se crearon en contado.Cuando termines esta parte, entonces comenzamos a hacer el build deploying del B1 con el Docker Audit, compost, backups, rollback.Y después seguimos con el resto de pasos. El día es poder comenzar a las diez y media el en vivo de hoy."
- L2 (user decisions): keep the documentation on `feat/vps-hardening-v1` instead of merging it into local `main`; Bash for Git Bash, WSL, macOS, and Linux; Spanish script messages (explicit override of the English-only artifact rule for user-facing script copy only).
- L3 (coordinator): Leak audit of `origin/main...feat/vps-hardening-v1` found no IPv4 address (the only match was the version string `1.8.3.0`), no hostname, instance ID, URL, token, or credential. The only identifier is the public-key fingerprint, which is not secret. Both Contabo support tickets were submitted by the user. No container-based integration test is used because pulling an `ubuntu:24.04` image would require a separate dependency audit and approval.
- L4 (worker + coordinator, T1): The worker implemented the driver, tests, and README (RED: missing driver; GREEN: 82 checks). Coordinator review then found severe defects: rollback-timer cancellation ran `sudo` without a TTY and masked the failure with `; true`, so UFW and the SSH drop-in would have been silently reverted after 5 minutes; the password and root rejection checks were vacuous under `BatchMode`; re-runs failed on leftover transient units; and Gate G2 captured `ssh -t` output, hiding the sudo prompt and always failing. A worker continuation fixed cancellation through `ssh -t`, re-run cleanup, authoritative `sshd -T` plus `Permission denied (publickey)` checks, and UFW `allow` before `default deny`, but ended without a report. The coordinator added RED tests (4 failures observed), fixed Gate G2 to decide on the remote exit status of `test "$(sudo whoami)" = root`, and made cancellation depend only on timer inactivity after `sudo -v`. Result: 105/105.
- L5 (independent verifier, V1): `aveento/gemini-3.8-flash-high` returned PASS for S1–S4 and every Design row, with no severe findings. Medium: the reboot wait could accept the pre-reboot system and the reboot command hid sudo errors. Low: `\b` in the alias regex is not POSIX ERE (macOS); `IdentityFile` used the Git Bash `/c/...` path, which native Windows OpenSSH cannot read; the client-side root rejection relies on `sshd -T` for authority (already asserted).
- L6 (coordinator, V1 fixes): RED tests first (2 failures observed), then fixed: the reboot wait compares `/proc/sys/kernel/random/boot_id` before and after and no longer masks the reboot command; the alias check uses a POSIX expression; `IdentityFile` is written as `~/...`. `bash -n` and `bash scripts/vps/test-bootstrap-ubuntu-vps.sh` pass 108/108. Live-only risks for A1: Contabo root password entry, reboot timing within 300 seconds, provider banners, and VNC reachability.
