# Feature: deploy-v1

First production-grade deployment of the Monteluna storefront and Go API to the hardened Contabo VPS at `montelunaco.com`: audited Docker install, Compose stack (Caddy, Go API, PostgreSQL 18), the project deploy script with health-checked automatic rollback, and independent backups with a restore drill. Branch `feat/deploy-v1` (based on `feat/vps-hardening-v1`); nothing is pushed without explicit authorization.

## Specs

### S1: Build the deployment
> "Cuando termines esta parte, entonces comenzamos a hacer el build deploying del B1 con el Docker Audit, compost, backups, rollback.Y después seguimos con el resto de pasos."

Covers: Docker dependency audit and install, Docker Compose production stack, backups, and rollback, following the approved flow in `docs/architecture/system-architecture.md` and the `deployment` skill.

### S2: Domain
> "montelunaco.com"

### S3: Approved deployment flow (canonical, `system-architecture.md` §6)
Preflight (clean tree, existing `vX.Y.Z` tag, local CI gates) → build Go and Caddy images in Linux containers tagged with version and SHA → `docker save | ssh docker load` → pre-deploy `pg_dump -Fc` → goose migrations (expand → migrate → contract) → `docker compose up` with per-service memory limits → health check on `GET /api/v1/health` with automatic rollback of both images to the previous tag → record the active release. Never build on the VPS; secrets in a `0600` env file outside Git.

## Design (coordinator)

- Only Caddy publishes host ports (80, 443). PostgreSQL and the Go API publish no ports and live on an internal Compose network: Docker-published ports bypass UFW (documented by Docker), so an unpublished port is the only reliable way to keep them private.
- UFW additionally allows 80/tcp and 443/tcp for clarity and for Caddy's ACME HTTP challenge.
- Every service sets `mem_limit` and an equal `memswap_limit`, so containers cannot consume host swap.
- The Caddy admin API stays bound to localhost inside its container and is never published.
- The Go module must build with the audited Go 1.27.3 toolchain (`chore/go-1.27.3`, user-approved security exception) because 1.27.2 triggers reachable `GO-2026-6809`.
- Identity and Notifications are not on this base yet; when they ship they deploy together (existing decision).

## Tasks

| ID | Task | Specs | Route | Commit |
|---|---|---|---|---|
| D0 | User decisions: Docker version, backup provider and retention, DNS management, first-deploy environment | S1, S2 | user | done (L5) |
| A1 | Audit and pin images by digest: PostgreSQL 18, Caddy 2, Go build, Node 24.21.0 build, Go runtime base | S1, S3 | coordinator | pending |
| T1 | Bring the Go 1.27.3 toolchain commit onto the branch; confirm build, tests, govulncheck | S3 | coordinator | pending |
| T2 | Container images: backend Dockerfile, Caddy image with baked Astro assets, `.dockerignore` | S1, S3 | worker | pending |
| T3 | `deploy/compose.yaml`, Caddyfile, env template, memory limits | S1, S3 | worker | pending |
| T4 | `deploy/deploy.sh`: preflight, build, transfer, pre-deploy dump, migrate, start, health check, automatic rollback, release record | S1, S3 | worker | pending |
| T5 | Backups: daily `pg_dump -Fc` systemd timer, restic off-site, restore drill script | S1 | worker | pending |
| T6 | VPS: install audited Docker, open 80/443, DNS records, first release, restore drill | S1, S2 | user + coordinator | pending |
| V1 | Independent verification of exposure, rollback, and backups | S1–S3 | verifier | pending |

## Log

- L1 (user): "Cuando termines esta parte, entonces comenzamos a hacer el build deploying del B1 con el Docker Audit, compost, backups, rollback.Y después seguimos con el resto de pasos. El día es poder comenzar a las diez y media el en vivo de hoy."
- L2 (user): domain "montelunaco.com". Recorded in `docs/architecture/infrastructure.md`; DNS records and provider remain pending.
- L3 (coordinator, exploration): Production entry points exist: `backend/cmd/api`, `backend/cmd/migrate` (embedded goose for catalog, shipping, orders, payments), `GET /api/v1/health`, Astro `output: 'static'` with same-origin `/api`. No Dockerfile, Caddyfile, `deploy/`, or `vX.Y.Z` tag exists yet; `CHANGELOG.md` has only `[Unreleased]`. `backend/go.mod` on this base still uses `toolchain go1.27.2`.
- L4 (coordinator, Docker audit): Official install path is Docker's APT repository for Ubuntu Noble (`docker-ce`, `docker-ce-cli`, `containerd.io`, `docker-compose-plugin`; buildx is unnecessary because nothing builds on the VPS; the `get.docker.com` script is documented as not for production). Docker Engine 29.9.2 (2026-10-20) only updates Go to 1.26.10 and blocks compromised eMudhra intermediates (CVE-2026-111943); 29.9.1 (2026-10-14) updates containerd to 2.4.2 for three pull/import crash and disk-exhaustion fixes; 29.9.0 (2026-10-08) fixes five HTTP/2 daemon CVEs. No known regressions listed. Docker documents that published container ports bypass UFW.
- L5 (user decisions, D0): Docker Engine "29.9.2 con excepción"; backups "Cloudflare R2, 7d/4s/6m"; DNS "Cloudflare, solo DNS"; first deploy "staging.montelunaco.com con Wompi sandbox". Recorded in `docs/architecture/infrastructure.md` §5.
