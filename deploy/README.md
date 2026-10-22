# Monteluna Deployment Guide

Production deployment automation for the Monteluna eCommerce stack on Ubuntu 24.04 LTS (Noble Numbat).

This guide covers operator prerequisites on the VPS, deployment execution via `deploy/deploy.sh`, automatic rollback mechanics, release tracking, and manual intervention procedures.

---

## 1. Architecture and Privilege Model

- **Local builds only:** Container images are built in local Linux containers on the developer machine (`--platform linux/amd64`). No compiler, Node.js toolchain, or build cache exists on the VPS.
- **Direct image streaming:** Local images are exported with `docker save | gzip`, transferred to the VPS via `scp`, and loaded directly into the remote Docker daemon (`docker load`). No container registry is required.
- **Dedicated SSH alias & minimal privilege:** The deployment script connects over an SSH alias (configured in `~/.ssh/config`).
- **No docker group:** The remote operator user is **never** added to the `docker` group (which is root-equivalent). All Docker commands run inside a single interactive `ssh -t` session executing `sudo bash` (one password prompt per deployment).
- **Network isolation:** Only Caddy publishes host ports (`80:80`, `443:443`, `443:443/udp`). The Go API and PostgreSQL containers run on an internal Docker network with unpublished ports.
- **Secrets outside Git:** Environment secrets reside on the VPS at `/srv/monteluna/.env` with strict `0600` permissions. The deploy script reads credentials without printing them.

---

## 2. VPS Prerequisites

Before executing the first deployment, the remote host must meet the following baseline requirements:

### 2.1 Audited Docker Installation
Install Docker Engine 29.9.2 and the Docker Compose plugin from Docker's official Ubuntu repository (per `docs/architecture/infrastructure.md` §5):
```bash
# Verify Docker Engine and Compose plugin
docker --version         # Docker version 29.9.2
docker compose version   # Docker Compose version v2.x
```
*(Buildx is unnecessary because all builds occur on the developer machine).*

### 2.2 Environment Configuration File
Initialize the production environment file from the committed template:
```bash
sudo mkdir -p /srv/monteluna
sudo cp deploy/env.example /srv/monteluna/.env
sudo chmod 0600 /srv/monteluna/.env
sudo chown root:root /srv/monteluna/.env
```
Populate `/srv/monteluna/.env` with real credentials:
- `SITE_ADDRESS=staging.montelunaco.com` (for initial release)
- `ACME_EMAIL=admin@montelunaco.com`
- `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`
- `DATABASE_URL=postgres://<user>:<password>@postgres:5432/<db>?sslmode=disable`
- `TRACKING_TOKEN_SECRET` (base64-encoded 32-byte secret)
- Wompi sandbox credentials (`WOMPI_PUBLIC_KEY`, `WOMPI_PRIVATE_KEY`, `WOMPI_INTEGRITY_SECRET`, `WOMPI_EVENTS_SECRET`)

### 2.3 Cloudflare DNS Configuration
- Domain: `montelunaco.com`.
- For the initial release, create an **A** (and/or **AAAA**) record for `staging.montelunaco.com` pointing to the VPS public IP.
- **DNS-only mode:** Ensure proxy status is set to **DNS only** (grey cloud, not orange cloud) in the Cloudflare dashboard so Caddy can obtain ACME TLS certificates directly via HTTP-01 / TLS-ALPN-01 challenges.

### 2.4 Firewall Configuration (UFW)
Ensure UFW allows HTTP, HTTPS, and HTTP/3:
```bash
sudo ufw allow 80/tcp comment 'Caddy HTTP'
sudo ufw allow 443/tcp comment 'Caddy HTTPS'
sudo ufw allow 443/udp comment 'Caddy HTTP/3'
sudo ufw status
```

---

## 3. Deployment Flow

Every deployment is driven by `deploy/deploy.sh` and executes the following sequence:

```
[Local Preflight]
       │  (Clean tree, existing vX.Y.Z tag, HEAD == tag, local CI gates)
       ▼
[Local Build]
       │  (docker build linux/amd64: API and Caddy with baked Astro assets)
       ▼
[Transfer]
       │  (scp images.tar.gz and compose.yaml to remote /tmp staging)
       ▼
[Remote sudo bash Session]
       ├── 0. docker load < images.tar.gz
       ├── 1. Pre-deploy pg_dump -Fc (if active release exists)
       ├── 2. Database migrations: /app/migrate via Compose run
       ├── 3. Start release containers: docker compose up -d
       ├── 4. Health check: GET https://$SITE_ADDRESS/api/v1/health (up to 60s)
       │       ├── On failure -> Automatic rollback to previous release
       │       └── On success -> Continue
       ├── 5. Record release in /srv/monteluna/current & releases.log
       └── 6. Prune older monteluna-* images (retaining current and previous)
```

---

## 4. First Deployment

On a brand-new VPS with no active release:
1. Ensure the working tree is checked out at the target SemVer tag:
   ```bash
   git checkout v0.1.0
   ```
2. Run the deployment script providing the SSH alias and tag:
   ```bash
   deploy/deploy.sh <ssh-alias> v0.1.0
   ```
3. **First-deploy behavior:**
   - Because no `/srv/monteluna/current` exists, step 1 skips the pre-deploy database dump.
   - Database migrations apply all initial schemas (`catalog`, `shipping`, `orders`, `payments`).
   - If the health check fails on the first deploy, the script reports a clear error (`First deploy failed health check; no previous release to roll back to`), logs the failure in `releases.log`, and exits without attempting an invalid rollback.

---

## 5. Routine Deployments

For subsequent releases:
1. Ensure the repository working tree is clean and points to the approved version tag:
   ```bash
   git status  # Clean working tree
   git tag -l  # Tag v0.2.0 exists
   git checkout v0.2.0
   ```
2. Trigger the deployment:
   ```bash
   deploy/deploy.sh <ssh-alias> v0.2.0
   ```
3. The script automatically:
   - Takes a safety database dump before running migrations: `/srv/monteluna/backups/predeploy/<release>.dump`.
   - Runs migrations (`/app/migrate`).
   - Restarts containers with the new image tags.
   - Verifies backend health. On success, updates `previous` to the prior release and sets `current` to the new release.
   - Cleans up older images, keeping only `current` and `previous`.

---

## 6. Automatic and Manual Rollback

### Automatic Rollback
If the health check on `https://${SITE_ADDRESS}/api/v1/health` fails within 60 seconds:
1. The remote session catches the failure before completing the deploy.
2. It reads the previous release id from `/srv/monteluna/previous`.
3. It immediately restarts both `monteluna-api` and `monteluna-caddy` containers from the previous release using `/srv/monteluna/releases/<previous>/compose.yaml`.
4. It records the failure and rollback event in `/srv/monteluna/releases.log`.
5. The local deployment script exits with code 1.

### Manual Rollback Procedure
If an operator needs to manually roll back to the previous release outside of a failed deployment:

1. Connect to the VPS via SSH:
   ```bash
   ssh <ssh-alias>
   ```
2. Check the active and previous release tags:
   ```bash
   cat /srv/monteluna/current
   cat /srv/monteluna/previous
   ```
3. Switch back to the previous release:
   ```bash
   PREV=$(cat /srv/monteluna/previous)
   sudo -E MONTELUNA_RELEASE="$PREV" docker compose \
     -p monteluna \
     -f "/srv/monteluna/releases/${PREV}/compose.yaml" \
     up -d
   ```
4. Update release records:
   ```bash
   CUR=$(cat /srv/monteluna/current)
   echo "$PREV" | sudo tee /srv/monteluna/current
   echo "$CUR" | sudo tee /srv/monteluna/previous
   printf "%s %s %s MANUAL_ROLLBACK\n" "$PREV" "manual" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" | sudo tee -a /srv/monteluna/releases.log
   ```
5. If database rollback is needed, restore the pre-deploy database dump:
   ```bash
   # Dumps are stored in /srv/monteluna/backups/predeploy/<release>.dump
   sudo docker compose -p monteluna exec -T postgres pg_restore -U monteluna -d monteluna --clean /srv/monteluna/backups/predeploy/<failed-release>.dump
   ```

---

## 7. Release Records and VPS Filesystem Layout

All release artifacts on the VPS reside under `/srv/monteluna/`:

```
/srv/monteluna/
├── .env                                  # Mode 0600, production secrets
├── current                               # Release ID of the currently active release
├── previous                              # Release ID of the rollback target
├── releases.log                          # Audit log of all deployment attempts and outcomes
├── releases/
│   ├── v0.1.0-482318a/
│   │   └── compose.yaml                  # Exact Compose file used for v0.1.0
│   └── v0.2.0-b7c1234/
│       └── compose.yaml                  # Exact Compose file used for v0.2.0
└── backups/
    ├── predeploy/                        # Dumps created automatically before migrations
    │   └── v0.2.0-b7c1234.dump
    └── daily/                            # Dumps created by the systemd daily backup timer
```

### Audit Log Format (`releases.log`)
Each entry in `/srv/monteluna/releases.log` records:
`<release-id> <commit-sha> <utc-timestamp> <status>`

Example:
```
v0.1.0-482318a 482318ab9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f 2026-10-21T14:30:00Z SUCCESS
v0.2.0-b7c1234 b7c1234567890abcdef1234567890abcdef12345 2026-10-22T09:15:00Z FAILED_ROLLED_BACK_TO_v0.1.0-482318a
```

---

## 8. Backups and Disaster Recovery

Automated daily database dumps, off-site replication to Cloudflare R2 via `restic`, and monthly restore drills are handled independently from deployments.

See **[deploy/backup/README.md](backup/README.md)** for complete instructions on:
- Setting up the dedicated Cloudflare R2 bucket and credentials.
- Backing up the restic encryption key password independently.
- Configuring `/srv/monteluna/restic.env`.
- Enabling the `monteluna-backup.timer` systemd service.
- Executing the monthly restore drill script (`restore-drill.sh`).
