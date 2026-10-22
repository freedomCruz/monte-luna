# Feature: identity-notifications-release

Integrate the already verified Identity v1 and Notifications v1 backends (`odd/tasks/identity-v1.md`, `odd/tasks/notifications-v1.md`) with the current `main`, re-run every gate, deliver them as stacked PRs, and deploy them together to staging (existing decision: they ship together). Branch `feat/identity-notifications-v1` (from `feat/notifications-v1` + `origin/main`). Nothing is pushed or deployed without explicit authorization.

## Specs

### S1: Integrate after deploy-v1
> "Cerrar deploy-v1 y luego integrar Identity + Notifications (Recomendado)" — "Primero el cierre corto (main local, ramas, documento ODD; las etiquetas rc solo si las autorizas) y después poner al día Identity + Notifications con main, verificarlos y preparar su cadena de PRs."

### S2: Gates on current dependencies
Every backend gate passes on the integrated branch with today's vulnerability database: `go mod verify`, build, package-serial tests (Testcontainers PostgreSQL 18), vet, golangci-lint, govulncheck, sqlc drift, and the frontend/script gates of `task verify`. A dependency change requires a new `dependency-audit` and user approval.

### S3: Reviewable delivery
Stacked PRs to `main` with merge commits, as in deploy-v1 (L41–L43 of `odd/tasks/deploy-v1.md`); the slicing plan is a user decision.

### S4: Staging release
A new release candidate deploys Identity and Notifications to staging with any new secrets created on the host only (never in Git or chat), Resend in a non-production/sandbox mode, and real customer traffic still prohibited. Needs explicit user authorization.

## Tasks

| ID | Task | Specs | Route | Commit |
|---|---|---|---|---|
| T1 | Merge `origin/main` into the integration branch; run `task verify` | S1, S2 | coordinator | `5279ade` (L2, L4) |
| T2 | Propose the PR slicing; open the stacked PRs after approval | S3 | coordinator + user | pending |
| T3 | Review new env vars/secrets and migrations for staging; rc8 after approval | S4 | coordinator + user | pending |

## Log

- L1 (user, 2026-10-22): "Que seguimos trabajando ahora." → selected "Cerrar deploy-v1 y luego integrar Identity + Notifications (Recomendado)".
- L2 (coordinator, T1): Both features are independently verified (V1 PASS) with dependencies approved at their G2 gates (`scs/v2 v2.9.0`, `pquerna/otp v1.5.0`, `x/crypto v0.58.0`, `x/time v0.16.0`). Both branch from `8ea2739` (Go 1.27.3), already in `main`; `git merge-tree` reported no conflicts. Integration branch created and `origin/main` merged cleanly as `5279ade` (only `Taskfile.yml` auto-merged). Diff against `main`: 139 files, +15,629/-39, backend only (about 6,600 test lines and 1,800 generated sqlc/SQL lines).
- L3 (coordinator, T3 pre-read): Staging gaps found before any deploy. (a) The API now refuses to start without `APP_ENCRYPTION_KEY` (base64 of 32 bytes), and `deploy/env.example` lists neither it nor `NOTIFICATIONS_EMAIL_SENDER`/`RESEND_*`; deploying as-is would fail health and auto-roll back. (b) `backend/Dockerfile` builds only `/app/api` and `/app/migrate`, so the SSH-only bootstrap CLI `cmd/admin` (`create-owner`, password from stdin) is not in the image and the first owner could not be created on staging. (c) The three new migrations create new `identity` and `notifications` schemas only (additive, rollback-safe with the previous images). (d) Staging should keep `NOTIFICATIONS_EMAIL_SENDER=capture` until a sending domain is verified in Resend. Fixes for (a) and (b) touch delivery files (risk item 5) and need tests.
- L4 (coordinator, T1): `task verify` on `5279ade` exited 0: 36 Go packages ok (package-serial, Testcontainers PostgreSQL 18), golangci-lint 0 issues, govulncheck 0 reachable (one unreached module finding, GO-2026-5932 in the unimported `x/crypto/openpgp`, no fix available), npm audits 0, Astro check 0 errors, Vitest 32 files/198 tests, Playwright 124 across desktop and mobile.
- L5 (coordinator, T3a): RED: `deploy/test-compose.sh` failed with `deploy/env.example is missing required variable: APP_ENCRYPTION_KEY`, then (after the env fix) with `backend/Dockerfile must build ./cmd/admin to /app/admin`. Fix: `deploy/env.example` adds `APP_ENCRYPTION_KEY` (placeholder only), `NOTIFICATIONS_EMAIL_SENDER=capture` (asserted), and commented `RESEND_*`; `backend/Dockerfile` builds and copies `/app/admin` with the entrypoint unchanged (asserted). GREEN: `deploy/test-compose.sh` pass, `deploy/test-deploy.sh` 10/10. A real linux/amd64 image build runs `/app/admin` (fails closed with `DATABASE_URL is required`, no values printed) and `/app/migrate -h` lists catalog, shipping, orders, payments, identity, notifications. Git Bash path conversion mangles `/app/...` container paths; use `MSYS_NO_PATHCONV=1`. Risk: item 5.
