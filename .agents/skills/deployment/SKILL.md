---
name: deployment
description: "Trigger: deployment, deploy, release to VPS, Docker Compose, production migrations, backups, rollback. Guide and verify VPS deployment, backup, and recovery workflows."
license: Apache-2.0
metadata:
  author: ecommerce-project
  version: "1.0"
---

## Activation Contract

Use when authoring deployment scripts, deploying to the VPS, configuring Docker Compose, running production migrations, executing backups or restore drills, or executing rollbacks.

Do not use for routine local coding. Load `database-postgres` for migrations, `dependency-audit` before adding container images, and `changelog-releases` for release tags.

## Hard Rules

- Deployment layout: production Docker Compose configuration and deploy/backup scripts reside under `deploy/` (e.g., `deploy/compose.yaml`, `deploy/deploy.sh`, `deploy/backup.sh`). Invoked directly or via root `task deploy`.
- Deployment runner: project script run from developer machine; no GitHub Actions or paid CI required (free-tier PR checks pending). Script is authored when code exists.
- Access and secrets: dedicated deployment SSH key. Secrets never in Git (management pending; ask user).
- Artifacts: build in Linux containers on developer machine, never on VPS. Build produces two images: Go backend and Caddy image with baked-in static Astro assets. Both tagged with version (`vX.Y.Z`) and commit SHA, transferred and rolled back together. Stream images via `docker save | ssh <host> docker load` (no registry).
- Deployment flow (strictly in order):
  1. Preflight: clean git tree, existing `vX.Y.Z` tag, run local verification gates (local CI).
  2. Build: build container images in Linux containers (Go backend and Caddy with static assets), both tagged with version and SHA.
  3. Transfer: stream both images via `docker save | ssh <host> docker load`.
  4. Pre-deploy backup: execute `pg_dump -Fc` on VPS.
  5. Migrate: run `goose` migrations (expand -> migrate -> contract).
  6. Start: launch release via Docker Compose with per-service memory limits.
  7. Health check: query backend endpoint; on failure, auto-restart previous tag for both images and report.
  8. Record: persist active release (version, SHA, timestamp).
- Local development: Docker for PostgreSQL and Testcontainers; Go and Astro run natively.
- VPS containers: Docker Compose for all services (Go, PostgreSQL 18, Caddy reverse proxy pinned to exact version and digest). Memory limits unmeasured; measure on VPS. Caddy certificate data directory persisted in a volume and included in backups; admin API bound locally and never exposed.
- Frontend runtime: static output (`output: 'static'`); no Node.js on VPS. Static assets served by Caddy from the versioned Caddy image; Go `embed` rejected.
- Backups (independent of deploys):
  - Daily `pg_dump -Fc` on VPS via systemd timer.
  - Off-site `restic` to S3-compatible storage with encryption and deduplication. Disk media included if on disk (location pending); Caddy certificate volume included.
  - Monthly restore drill into separate database.
  - PITR (pgBackRest) deferred until sales scale.
  - Provider and retention pending user choice (7d/4w/6m proposed).

## Decision Gates

| Situation | Action |
| --- | --- |
| Dirty tree or unapproved tag | Abort; requires clean tree and existing `vX.Y.Z` tag |
| Local CI gate fails | Abort; resolve failures before building images |
| Build requested on VPS | Reject; build in local Linux containers |
| Migration breaks previous release | Reject; enforce expand -> migrate -> contract |
| Health check fails | Auto-rollback: restart previous tag, report failure |
| Missing previous image on VPS | Ensure at least one verified previous tag remains |
| Backup provider/retention config | Stop and ask user; settings pending |
| OS version or domain config | Stop and ask user; selections pending in canonical docs |

## Execution Steps

1. Verify clean git tree on existing `vX.Y.Z` tag.
2. Run local CI verification gates (backend, frontend, testing).
3. Build Linux container images (Go backend and Caddy with static assets) tagged with version and SHA.
4. Transfer images via `docker save | ssh <host> docker load`.
5. Run VPS pre-deploy `pg_dump -Fc`.
6. Run `goose` migrations.
7. Start containers via `docker compose up -d`.
8. Poll backend health endpoint; if unhealthy, auto-rollback both images to previous tag and abort.
9. Record active release metadata (version, SHA, timestamp).

## Output Contract

Report:
- Release tag, commit SHA, timestamp.
- Preflight and local CI results.
- Built images, transfer, and pre-deploy dump status.
- Migration results and expand-migrate-contract compliance.
- Docker Compose service state and health check response.
- Rollback details if triggered.
- Pending decisions or operational risks.

## References

- `docs/architecture/infrastructure.md` — Hardware and decisions.
- `docs/architecture/system-architecture.md` — Tooling and architecture status.
- `docs/architecture/data-modeling.md` — Section 12, Schema Evolution.
- `.agents/skills/monorepo/SKILL.md` — Monorepo layout and root Taskfile tasks.
- `.agents/skills/changelog-releases/SKILL.md` — Version tagging.
- `.agents/skills/database-postgres/SKILL.md` — goose migrations.
- Dokku registry-less deployment: https://dokku.com/tutorials/other/deploying-an-image-without-a-registry/
- restic documentation: https://restic.readthedocs.io/en/latest/030_preparing_a_new_repo.html
