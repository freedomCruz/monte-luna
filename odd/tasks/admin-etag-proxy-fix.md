# Feature: admin-etag-proxy-fix

Branch `fix/admin-etag-proxy` from `main` (`f41728b`, tag `v0.1.0-rc.10`).
Production defect: every admin write guarded by `If-Match` fails with `400` behind Caddy.

## Specs

### S1: Admin API responses keep their ETag intact

Caddy must not alter the `ETag` of responses under `/api/v1/admin/*`. Observed on staging: the backend sends `ETag: "3"`, Caddy compresses the response and rewrites it as `ETag: "3-gzip"`; the browser returns `If-Match: "3-gzip"`, which fails the strong-ETag pattern `^"[1-9][0-9]*"$` (`backend/internal/orders/adapters/admin_writes_http.go:17`, `backend/internal/identity/adapters/httpapi/admin.go:114`) and the API answers `400 Bad Request`.

Evidence captured against `https://staging.montelunaco.com` on 2026-11-04:

```
Accept-Encoding: identity -> Etag: "dmmljnxk69kw-cr3"
Accept-Encoding: gzip     -> Etag: "dmmljnxk69kw-cr3-gzip"  (Content-Encoding: gzip)
```

Affected writes: orders `to-preparing`, `deliver`, `cancel`, shipping `dispatch`, identity `users/{id}` and `users/{id}/totp/reset`.

### S2: Compression is preserved everywhere else

The exclusion is scoped to `/api/v1/admin/*` only. Static Astro assets keep `encode zstd gzip` with the `file_server` `precompressed zstd gzip` sidecars, and the public storefront API (catalog, checkout, tracking) stays compressed. This is the narrowest change that resolves S1.

### S3: The canonical documents record the exception

`docs/architecture/infrastructure.md` and `docs/architecture/system-architecture.md` record compression as approved (`infrastructure.md:64`, `:84`; `system-architecture.md:138`, `:201`). The approved rationale covers static asset compression (`precompressed` sidecars); compressing the API was an untargeted side effect of a site-wide `encode`. Both documents must state the exception and its reason. User authorization: L2.

### S4: A regression test fails on the current Caddyfile

A committed test must fail before the fix and pass after it, asserting that `encode` excludes `/api/v1/admin/*` while keeping the static sidecars and the `/api/*` proxy. It must run without Docker and without network, like `deploy/test-compose.sh`.

### S5: Released and verified live

Released as `v0.1.0-rc.11` and deployed to staging. Live proof: an admin write guarded by `If-Match` succeeds through Caddy, and a static asset still returns `Content-Encoding: gzip`.

## Tasks

| ID | Task | Specs | Route | Commit |
|---|---|---|---|---|
| T1 | RED regression test `deploy/test-caddy.sh`, then the Caddyfile exclusion | S1, S2, S4 | inline | done (L4) |
| T2 | Canonical documents and changelog | S3 | inline | done (L4) |
| T3 | Live proof through a real Caddy container with a stub origin | S1, S2 | inline | done (L5) |
| T4 | Release `v0.1.0-rc.11` and deploy to staging | S5 | user gate | done (L6) |

Risk: item 5 (delivery and environment: reverse proxy configuration baked into the released Caddy image). Item 2 is not touched: the exclusion changes transport encoding only, never authentication, authorization or headers.

## Log

- L1 (user, 2026-11-04): "Iría por la opción A pero mira en los documentos canónicos y engram porque habíamos llegado a esa conclusión de comprimir en caddy antes de hacer algo", then "listo apruebo la A".
- L2 (coordinator, canonical review before changing anything): compression is an approved decision in four canonical places (`infrastructure.md:64`, `:84`; `system-architecture.md:138`, `:201`) and Engram `#300` (`architecture/reverse-proxy-decision`, 2026-10-05) records the user approving Caddy as the reverse proxy; `#300` does not reason about compressing the API. The approved text argues static asset compression through `precompressed` sidecars, which only apply to `file_server`. Compressing `/api` follows from `encode zstd gzip` sitting at site level in `deploy/caddy/Caddyfile:8`. The user authorized option A scoped to `/api/v1/admin/*` plus the canonical updates.
- L3 (coordinator, how this escaped verification): backend and frontend suites exercise the API directly, never through Caddy, so no test covers the deployed request path. V1 of `admin-orders-v1` could not catch it either. S4 closes that gap for this rule only; a broader proxy-level suite stays out of scope here.
- L4 (coordinator, T1 and T2): `deploy/test-caddy.sh` written first and observed RED on the unchanged Caddyfile ("FAIL: encode applies a named request matcher instead of matching every request", exit 1), then GREEN 6/6 after adding `@compressible not path /api/v1/admin/*` and `encode @compressible zstd gzip` to `deploy/caddy/Caddyfile`. The test also pins what must survive: the `zstd gzip` formats, the `precompressed zstd gzip` sidecars, the `/api/*` proxy, and that the exclusion is never widened to the whole public API. The deploy test scripts were not run by any task, so a `deploy:test:caddy` task was added and wired into `task verify`, which the deploy preflight runs. Canonical updates: `infrastructure.md` (both the Section 4 bullet and the approved Section 5 decision, with the user's 2026-11-04 authorization and the reason) and `system-architecture.md` (tooling row and status row). Changelog entry under Unreleased, in user-visible terms.
- L6 (user and coordinator, T4, S5 verified on staging 2026-11-04): released as `v0.1.0-rc.11` (PR #46, tag on `main` at `5395836`) after the fix merged in PR #45; the user ran `deploy/deploy.sh monteluna-vps v0.1.0-rc.11` and confirmed that moving an order to "En preparación" now succeeds through Caddy, which closes S1. Coordinator checks against `https://staging.montelunaco.com`: health `200` `{"status":"ok"}`; a hashed `/_astro/*.js` asset still returns `Content-Encoding: gzip`; `/api/v1/products` still returns `Content-Encoding: gzip`; `/api/v1/admin/orders` returns `401` with no `Content-Encoding`, proving the exclusion is live (S2). Still unverified on staging and outside this fix: register dispatch, mark delivered, cancel, the customer emails for shipped and cancelled orders, and the order line thumbnail.
- L5 (coordinator, T3, live proof): built the project's own Caddy image stage (`docker build --target caddy-builder`, Caddy compiled from `deploy/caddy/go.mod`) and ran it against a stub origin returning `ETag: "3"` on both an admin path and a public path, requesting with `Accept-Encoding: gzip, zstd`. Caddy loaded the configuration, which validates the matcher syntax. Result: `/api/v1/admin/orders/{id}` returned `Etag: "3"` with no `Content-Encoding`; `/api/v1/products` returned `Content-Encoding: gzip` with `Etag: "3-gzip"`, reproducing the exact defect mechanism on the path that must keep compression. The probe container, image and scratch directory were removed; nothing was committed from them.
