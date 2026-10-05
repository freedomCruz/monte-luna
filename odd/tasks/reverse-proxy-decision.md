# Reverse Proxy Decision

## Goal and scope

Record the approved reverse proxy, static file serving, and rate limiting decisions in canonical docs and affected skills.

Approved decisions (2026-10-05):
1. Caddy is the reverse proxy: automatic HTTPS, official image pinned to an exact version and digest, admin API bound locally and never exposed.
2. Caddy serves the static Astro build, baked into a Caddy image tagged with the release version and commit SHA, so a rollback reverts frontend and backend together. Caddy proxies `/api` to the Go backend.
3. Rate limiting lives in the Go application (per account and per IP for admin login), not in the proxy; no custom Caddy build. Any rate-limiting library passes `dependency-audit`.

Still pending: domain configuration, secret-management tooling.

## Tasks

- [x] T1 — Update `infrastructure.md`, `system-architecture.md`, and the `deployment`, `backend-go-modules`, and `frontend-astro-islands` skills. Recorded approved Caddy reverse proxy, static file serving, and Go rate limiting decisions.
- [x] T2 — Read-only consistency check.
  - Result: grep finds no remaining "pending" mention of the proxy or static file server; domain configuration stays unchecked in `infrastructure.md` section 5; only the five allowed files changed.
- [x] T3 — Report to user.

## Verification and delivery

- TDD: not applicable; documentation only.
- Commit: not created; requires explicit user request.
