# Deployment Baseline

## Goal and scope

Record the approved deployment, backup, container, Astro output, and npm install-script decisions in canonical docs; create the `deployment` skill; update affected skills and the `AGENTS.md` index.

Approved decisions (2026-10-05):
1. Astro static output; no Node.js process in production.
2. npm 12 default-deny install scripts with an empty allowlist, replacing `ignore-scripts=true`. Only audited packages get version-pinned approvals. Playwright browsers install through `npx playwright install`. Never copy `node_modules` across operating systems.
3. Script-based deployment from the developer machine: preflight checks (local CI), Linux-container build, images tagged with version and commit SHA, `docker save | ssh docker load` (no registry), pre-deploy `pg_dump`, `goose` migrations, start, health check, automatic rollback, release record. No GitHub Actions required.
4. Backups: daily `pg_dump -Fc` plus restic to off-site S3-compatible storage with client-side encryption; monthly restore drill. Provider and retention pending (7 daily / 4 weekly / 6 monthly proposed).
5. Docker for local development (PostgreSQL and Testcontainers; Go and Astro run natively). Docker Compose with per-service memory limits on the VPS.

Still pending: reverse proxy, who serves static files (reverse proxy or Go `embed`), Ubuntu release, VPS purchase, backup provider and retention, monorepo rules (Node.js and npm versions, task runner, environment variables, `.gitattributes`).

Conversation preference: address the user with "tú" (recorded in `AGENTS.md` section 2).

## Tasks

- [x] T1 — Update canonical docs and skills; create the `deployment` skill.
  - Progress: Canonical docs (infrastructure, system architecture), AGENTS.md, affected skills updated, and deployment skill created with approved decisions.
- [x] T2 — Independent read-only verification.
  - Result: pass with notes, no blockers. Notes: `docs/plan-payload.md` is referenced but absent from disk; deployment skill execution steps unpack preflight into two steps (order unchanged).
- [x] T3 — Report to user.

## Verification and delivery

- TDD: not applicable; documentation and skills only.
- Commit: not created; requires explicit user request.
