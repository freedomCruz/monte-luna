# Monteluna Backup and Disaster Recovery

Automated daily backups, off-site Cloudflare R2 replication, restic repository maintenance, and monthly restore drill procedure for the Monteluna production stack.

---

## 1. Architecture Overview

- **Database dumps:** Daily PostgreSQL 18 custom-format dump (`pg_dump -Fc`) executed via `docker compose -p monteluna exec -T postgres`.
- **Certificates:** Caddy TLS certificate store volume (`monteluna_caddy_data`) mountpoint is backed up alongside database dumps.
- **Off-site replication:** Encrypted, deduplicated snapshots pushed to Cloudflare R2 using `restic`.
- **R2 Retention policy:** 7 daily, 4 weekly, and 6 monthly snapshots (`restic forget --keep-daily 7 --keep-weekly 4 --keep-monthly 6 --prune`), followed by repository integrity check (`restic check`).
- **Local retention:** The VPS keeps the last 7 daily local dumps in `/srv/monteluna/backups/daily/`.
- **Systemd automation:** `monteluna-backup.service` (oneshot, hardened root service) scheduled daily via `monteluna-backup.timer` with `Persistent=true` and `RandomizedDelaySec=30m`.
- **Restore verification:** Automated monthly restore drill script (`restore-drill.sh`) testing dump integrity and module schema migrations.

> **Note on restic installation:** Restic is assumed to be installed on `PATH` on the VPS. Its binary installation and verification is a separate audited step (task `A2` in `odd/tasks/deploy-v1.md`). Do not install unverified binaries.

---

## 2. Cloudflare R2 Bucket and API Token Setup

1. **Create dedicated R2 bucket:**
   - Log into the Cloudflare Dashboard and navigate to **R2**.
   - Create a dedicated bucket (e.g. `monteluna-backups`).
   - *Requirement:* Keep this bucket strictly isolated from media assets.

2. **Generate scoped API token:**
   - Go to **R2 > Manage R2 API Tokens > Create API token**.
   - Permissions: **Object Read & Write**.
   - Scope: Specific bucket `monteluna-backups` only.
   - Note the **Access Key ID**, **Secret Access Key**, and the S3 API endpoint:
     `https://<account-id>.r2.cloudflarestorage.com`

---

## 3. Independent Password Backup

The restic repository encryption password protects all data in R2.

1. **Generate strong repository password on the VPS:**
   ```bash
   sudo openssl rand -base64 32 > /srv/monteluna/restic.pw
   sudo chmod 0600 /srv/monteluna/restic.pw
   sudo chown root:root /srv/monteluna/restic.pw
   ```
2. **Critical: Back up the password independently:**
   - Store this password in the merchant's secure primary password manager (e.g. 1Password, Bitwarden) and an offline secure backup.
   - **Warning:** If this password is lost, encrypted backups on R2 cannot be recovered under any circumstances.

---

## 4. VPS Configuration

1. Copy the example configuration to `/srv/monteluna/restic.env`:
   ```bash
   sudo cp deploy/backup/restic.env.example /srv/monteluna/restic.env
   sudo chmod 0600 /srv/monteluna/restic.env
   sudo chown root:root /srv/monteluna/restic.env
   ```
2. Edit `/srv/monteluna/restic.env` and populate the variables:
   ```sh
   RESTIC_REPOSITORY=s3:https://<account-id>.r2.cloudflarestorage.com/<bucket>
   AWS_ACCESS_KEY_ID=<your-r2-access-key-id>
   AWS_SECRET_ACCESS_KEY=<your-r2-secret-access-key>
   RESTIC_PASSWORD_FILE=/srv/monteluna/restic.pw
   ```
3. Both `/srv/monteluna/restic.env` and `/srv/monteluna/restic.pw` must remain mode `0600`. The backup script refuses to run if permissions are wider or missing.

---

## 5. Initialize Restic Repository

Before running the first backup, initialize the repository once:

```bash
set -a
. /srv/monteluna/restic.env
set +a

restic init
```

Verify that restic confirms successful repository creation.

---

## 6. Install Systemd Units and Run First Backup

1. Place scripts in `/srv/monteluna/`:
   ```bash
   sudo cp deploy/backup/backup.sh /srv/monteluna/backup.sh
   sudo cp deploy/backup/restore-drill.sh /srv/monteluna/restore-drill.sh
   sudo chmod 0700 /srv/monteluna/backup.sh /srv/monteluna/restore-drill.sh
   sudo chown root:root /srv/monteluna/backup.sh /srv/monteluna/restore-drill.sh
   ```

2. Copy systemd units to `/etc/systemd/system/`:
   ```bash
   sudo cp deploy/backup/monteluna-backup.service /etc/systemd/system/monteluna-backup.service
   sudo cp deploy/backup/monteluna-backup.timer /etc/systemd/system/monteluna-backup.timer
   sudo systemctl daemon-reload
   ```

3. **Execute first backup manually to verify:**
   ```bash
   sudo systemctl start monteluna-backup.service
   sudo journalctl -u monteluna-backup.service -n 50 --no-pager
   ```
   Check that:
   - A new dump exists in `/srv/monteluna/backups/daily/`.
   - `restic backup` succeeded.
   - `restic forget` and `restic check` passed.

4. **Enable and start the daily timer:**
   ```bash
   sudo systemctl enable --now monteluna-backup.timer
   systemctl list-timers monteluna-backup.timer
   ```

---

## 7. Monthly Restore Drill

The restore drill ensures that backup dumps are not corrupted and can be restored cleanly.

### What `restore-drill.sh` executes:
1. Locates the newest `.dump` file in `/srv/monteluna/backups/daily/`.
2. Registers a trap to guarantee the temporary database is dropped even on script interruption or error.
3. Creates a temporary database named `restore_drill`.
4. Runs `pg_restore -U postgres -d restore_drill --no-owner` on the dump.
5. Runs sanity queries against every module's `goose_db_version` table:
   - `catalog.goose_db_version`
   - `shipping.goose_db_version`
   - `orders.goose_db_version`
   - `payments.goose_db_version`
6. Always drops `restore_drill` upon completion or exit.
7. Exits `0` on success, or non-zero on any failure.

### Manual Execution:
```bash
sudo /srv/monteluna/restore-drill.sh
```

### Scheduling the Monthly Drill:
Run the drill on the 1st of every month via cron or a dedicated systemd timer:
```cron
# /etc/cron.d/monteluna-restore-drill
0 4 1 * * root /srv/monteluna/restore-drill.sh >> /var/log/monteluna-restore-drill.log 2>&1
```

---

## 8. Full Disaster Recovery / Restore Procedure

If the VPS is lost or catastrophic corruption occurs:

1. **Provision new server:** Complete OS hardening and install Docker (audited Docker 29.9.2) and restic (audited binary A2).
2. **Retrieve secrets:** Recover `/srv/monteluna/restic.pw` and R2 credentials from the independent offline vault. Recreate `/srv/monteluna/restic.env` (`chmod 0600`).
3. **Inspect snapshots:**
   ```bash
   set -a; . /srv/monteluna/restic.env; set +a
   restic snapshots
   ```
4. **Restore files from latest snapshot:**
   ```bash
   restic restore latest --target /
   ```
   This restores `/srv/monteluna/backups/daily/` and the Caddy certificate volume directory.
5. **Start PostgreSQL container:**
   ```bash
   cd /srv/monteluna/current # or deployment directory
   docker compose -p monteluna up -d postgres
   ```
6. **Restore database:**
   Find the latest dump in `/srv/monteluna/backups/daily/`:
   ```bash
   LATEST_DUMP=$(ls -1t /srv/monteluna/backups/daily/*.dump | head -n1)
   docker compose -p monteluna exec -T postgres \
     pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists --no-owner < "$LATEST_DUMP"
   ```
7. **Start full application stack:**
   ```bash
   docker compose -p monteluna up -d
   ```
8. **Verify system health:**
   ```bash
   curl -f http://localhost:8080/api/v1/health
   ```
   Verify storefront and check logs with `docker compose -p monteluna logs -f`.
