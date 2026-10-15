# Feature: Cart & Checkout v1 (Orders & Shipping)

Browser cart, server-side checkout quote, guest order placement with a 30-minute stock reservation, and guest order view. Payment (Wompi), coupons, and invoice issuance are out of scope.
Rules: `AGENTS.md` section 5 and the `parallel-agents-orca` skill. Read this whole document up to `## Log` before working.

Canonical sources: `docs/architecture/api-conventions.md`, `docs/domain/orders.md`, `docs/domain/shipping.md`, `docs/architecture/invoicing-and-taxes.md`, `docs/design/monteluna/design-system.md`.
Reference canvas (desktop and `-390` mobile): `M-Carrito-Panel`, `M-Carrito`, `M-Checkout-Datos`, `M-Checkout-Pago`, `M-Pedido` under `docs/design/monteluna/canvas/`.
Contract: `contracts/openapi/orders.yaml` (no `shipping.yaml` in this wave, L2).

## Specs

### S1: Browser cart and header counter
- Cart state lives only in the browser (`localStorage` plus a reactive store). No cart table or server session.
- "Agregar al carrito" is enabled in the product detail purchase island for in-stock variants (lifts the Catalog v1 no-add-to-cart exception). The shared `ProductCard` keeps the canvas link to the product detail ("Ver producto" / "Elegir · desde"); the canvas has no add-to-cart on cards (L24).
- Slide-over panel matches `M-Carrito-Panel` (desktop and 390); cart page `/carrito` matches `M-Carrito`.
- Lines show image, name, variant label, unit price, quantity controls (+, −, delete), and line total. Prices shown in the cart are read live from the catalog API, never stored as authoritative.
- The header badge shows the total item count on every page.
- No coupon field (L2).

### S2: Shipping zones and rates (`internal/shipping`)
- Schema `shipping` with `shipping_zones`, `shipping_zone_areas`, `shipping_rates` per `docs/domain/shipping.md`.
- Quote resolution is an in-process port consumed by `internal/orders`; no public HTTP endpoint (L2).
- Input: `municipality_code` (5-digit DIVIPOLA), `total_weight_grams`, `order_subtotal`. A municipality match wins over a department match (`left(municipality_code, 2)`); rate by weight band; cost `0` when the subtotal reaches the rate's free-shipping threshold.
- Output: rate name, shipping amount, free-shipping flag, estimated delivery business days min and max. Estimated days are always present on every rate (`min >= 1`, `max >= min`); demo rates use 3 to 5 business days until a carrier integration exists (L12). No matching zone or rate means the destination is unsupported.
- Seed: demo zones and rates.

### S3: Checkout quote (`POST /api/v1/orders/quote`)
- Request: cart items (`variant_id`, `quantity`) and `municipality_code`.
- Server composition: catalog (live price, status, weight, stock), shipping port, `TaxCalculator` port.
- Response: lines with verified prices, shipping summary, subtotal, shipping, tax, and total amounts. Read-only; reserves and stores nothing; `Cache-Control: no-store`.
- Errors per the contract: `unknown_municipality`, `unsupported_destination`, `variant_unavailable` (422), `insufficient_stock` (409).

### S4: Order placement and 30-minute reservation (`POST /api/v1/orders`)
- Requires `Idempotency-Key`; same key and body within 24 hours returns the original response; different body returns `idempotency_key_reused`.
- Request: items; buyer (`email`, `full_name`, optional `phone`); shipping address (recipient name and phone, municipality, address line 1, optional line 2, optional postal code, optional delivery notes); optional fiscal data (`natural` with CC, CE, or PP; `legal` with NIT); `accepts_data_policy` must be `true` (L2, L5).
- Recomputes the quote; never trusts client amounts.
- UUIDv7 order id; random Crockford base32 order number `ORD-XXXXXXXX`; 32-byte tracking token, only its SHA-256 hash stored, raw token returned once.
- Allocates stock oldest lot first; `pending_payment` with `reservation_expires_at = placed_at + 30 minutes`; immutable line, lot allocation, address, fiscal, and shipping snapshots (including `product_slug` and estimated days, L5).
- Publishes `orders.order_placed` through the outbox; if persistence fails after allocation, the catalog allocation is released immediately.
- Insufficient stock returns `409 insufficient_stock` and leaves stock and orders unchanged.
- Idempotency results are stored in `orders.idempotency_keys` (`docs/domain/orders.md` section 3.7).
- Reservation expiry (L18): a periodic job moves `pending_payment` orders whose `reservation_expires_at <= now()` to `expired`, writes `order_status_history`, releases their catalog allocations (movement reason `release`), and publishes `orders.order_expired`. The in-flight payment grace (up to 2 hours) arrives with the payments module.

### S5: Checkout and order view UI
- `/checkout` matches `M-Checkout-Datos` (step 2 of 3): buyer data, recipient ("Lo recibo yo" or another person), department and municipality selectors, address fields, optional invoice section, consent checkbox, live shipping quote state (quoted, free, no coverage), and order summary.
- Step 3 is a payment shell matching `M-Checkout-Pago` without a real payment; it states that payment is not yet available (Wompi is a later wave).
- `/pedido?token=…` (guest order view) matches `M-Pedido`: order number, reservation countdown while `pending_payment`, status steps, delivery address and recipient, estimated time, lines with image, variant, roast date and price, totals, and the origin block. Images and origin come from the catalog API by `product_slug`.

### S6: DIVIPOLA reference data
- Department and municipality selectors and the backend municipality validation use one versioned snapshot of the official DANE dataset "DIVIPOLA – Códigos municipios" (datos.gov.co `gdxc-w37w`, CC BY-SA 4.0, attribution to DANE), generated by a repository script; no npm dependency (L4, L6).
- Canonical file: `contracts/reference/divipola.json` (source and license in `contracts/reference/README.md`); 33 departments and 1,122 municipalities, each with official `name`, title-cased `display_name`, and `type` (`municipality`, `non_municipalized_area`, `island`).
- Backend: embeds its own copy under `backend/` and a test asserts it is byte-identical to the canonical file; unknown codes return `unknown_municipality`; order snapshots store `display_name` values.
- Frontend: derives its own copy under `frontend/` (only the fields the selectors need, loaded on the checkout page only) in a generation step checked like `src/generated`.

## Tasks

| ID | Task | Specs | Owner | Depends on | Commit |
| --- | --- | --- | --- | --- | --- |
| T1 | Feature document and Engram mirror (done) | S1–S6 | coordinator | — | `a1ccf00` |
| C1 | `orders.yaml` contract → Gate G3 (done; approved L6) | S3, S4, S5 | coordinator draft (L1), backend owns later changes | T1 | `a1ccf00` |
| D1 | DIVIPOLA snapshot script and data file with attribution (done) | S6 | coordinator | G3 | `91eb4d6` |
| B1 | Shipping schema, migrations, seed, and quote port; embedded DIVIPOLA copy with equality test (done) | S2, S6 | backend | G3, D1 | `778124a`, `4310496`; merged `5386207` |
| B1b | New shipping migration making estimated days NOT NULL (`min >= 1`, `max >= min`), domain validation, demo rates 3 to 5 business days (L12) (done) | S2 | backend | B1 | `05f655a`; merged a262de6 |
| B2 | Orders schema, migrations, catalog read port, minimal `invoicing` TaxCalculator, quote endpoint (done) | S3 | backend | B1b, D1 | `e495270`, `7a65578`, `b0bd5b8`, `f5a012f`; merged `41facbe` |
| B3 | Order placement, catalog allocation and release, order number, HMAC tracking token, idempotency, outbox, guest order endpoint, reservation expiry (done) | S4, S5 | backend | B2 | `24ed0ef`, `acd5d5d`; merged `a6eb1eb` |
| F1 | Install approved Nano Stores packages (L8); cart store, slide-over panel, `/carrito`, header badge (done; visual acceptance in V1) | S1 | frontend | G3 | `ac538fe`, `e676dce`; merged `b1d78f5` |
| F2 | Enable "Agregar al carrito" in the purchase island; remove coupon copy (L22) (done; visual acceptance in V1) | S1 | frontend | F1 | `25d1540`; merged `0d8a1fc` |
| F3 | `/checkout` data step, live quote, DIVIPOLA selectors, and payment shell (in progress) | S5, S6 | frontend | F2, D1 | — |
| F1c | Refactor: extract shared cart line and quantity stepper components used by `CartPanel`, `CartPage` and `ProductPurchaseIsland` (L30); no visual change | S1 | frontend | F3 | — |
| F4 | Order placement integration and `/pedido` guest view | S4, S5 | frontend | F3 | — |
| I1 | Integrate branches, end-to-end checkout against the real API, `task verify` | all | coordinator | B3, F4 | — |
| V1 | Verification of every spec, including desktop and mobile visual comparison against canvas | all | verifier | I1 | — |

## Log

- L1 (user): "si ve prepando la OD y el contrato ve guardando en engram"
- L2 (user decisions, 2026-10-15): shipping quote "Solo puerto interno (Recomendado)"; invoice section "Sí, capturar y guardar (Recomendado)"; coupon "Fuera de esta ola (Recomendado)".
- L3 (coordinator review, 2026-10-15): first contract draft violated `api-conventions.md` (broken `common.yaml` references, `nullable: true`, per-field `currency`, missing `additionalProperties: false` and error codes, `processing` status) and did not match `M-Checkout-Datos` (buyer versus recipient, address line 2, postal code, consent, fiscal data). Rewritten; `kin-openapi` validation and `openapi-typescript` generation pass.
- L4 (user, DIVIPOLA source): "investigalo en la web o si existe librería para trabajar con esos códigos". Findings: official DANE dataset `gdxc-w37w` (1,122 rows: 1,103 municipalities, 18 non-municipalized areas, 1 island; updated 2025-01-24; CC BY-SA 4.0); npm `colombia-cities` 1.0.0 and `colombia-territorial` 1.1.0 are single-maintainer packages with unverified provenance. Recommendation: repository snapshot of the official dataset.
- L5 (coordinator, from `M-Pedido`): guest view needs recipient phone, estimated delivery days, roast date, product image, and origin. Added `orders.shipping_estimated_days_min/max` and `order_lines.product_slug` to `docs/domain/orders.md`.
- L6 (user, 2026-10-15): "Listo, apruebo contrato y también el script de Divi Pola." Gate G3 passed.
- L7 (coordinator, D1): `scripts/divipola/` (pure `divipola.mjs`, network-only `update-divipola.mjs`, `node --test` suite: RED on missing module, then 3 passing); tasks `scripts:test` (added to `verify`) and `divipola:update`; generated `contracts/reference/divipola.json` (DANE rows updated 2025-01-24) with `README.md` attribution. Contract change limited to the `municipality_name` description and the `Bogotá, D. C.` examples (non-normative).
- L8 (user, 2026-10-15): dependencies "nanostores + react + persistent (Recomendado)" — `nanostores@1.5.5`, `@nanostores/react@2.0.1`, `@nanostores/persistent@1.3.5`, exact versions, installed by the frontend worker in F1 (audit: MIT, 0 transitive dependencies, no install scripts, OSV clean, provenance attestations, older than 7 days). Orca run: "Sí, lanzar B1 y F1 (Recomendado)".
- L9 (coordinator, 2026-10-15): Orca run `run_d798699b028e`. B1 `task_684a4d33ecf8` dispatch `ctx_a8e949d37aa4` (openai-codex/gpt-6.1-sol, worktree `cart-and-orders-backend`, branch `feat/cart-and-orders-backend`); F1 `task_ee4594ad6616` dispatch `ctx_d25a2a5b815d` (local-proxy/gemini-3.8-flash-high, worktree `cart-and-orders-frontend`, branch `feat/cart-and-orders-frontend`). Pi folder trust: "Confiar solo en esta sesión" (user). Remaining Orca tasks are created when their dependencies settle.
- L10 (coordinator, B1): worker_done succeeded (`778124a`, `4310496`, merged `5386207`). Evidence: `task backend:verify` exit 0 (build, tests incl. PostgreSQL 18 migrations up/down/up and CLI regressions, vet, lint 0 issues, govulncheck clean, no sqlc drift), RED to GREEN observed, coverage domain 92.9 %, app 91.7 %. First final run failed on a transient Testcontainers Docker-provider discovery error on Windows; one rerun authorized by the coordinator passed. Coordinator follow-up applied: `migrate` and `seed` without flags run catalog then shipping; `-module` is an optional filter. Minor: commit subjects omit the `(shipping)` scope.
- L11 (coordinator finding): `docs/domain/shipping.md` defines `estimated_days_min/max` as nullable and `>= 0`, but the approved contract `ShippingSummary` requires integers `>= 1` and `docs/domain/orders.md` snapshots them `NOT NULL`. B1 correctly follows `shipping.md`. Contract change needed before B2 (gate G4).
- L12 (user, gate G4, 2026-10-15): "los días de entrega normalamente es de 3 días nunca menor a eso" then "podemos usar entonces de 3 a 5 días. Lo que pasa es que tendríamos que definir de acuerdo a las entragas aquí en colombia de acuerdo a la ciudad y la transportadora eso. Pero como por  ahora no vamos a conectar ninguna api externa de trasporte puede se de 3 a 5 días hábiles". Resolution: estimated days required on every rate (`min >= 1`, `max >= min`), demo rates 3 to 5 business days; `docs/domain/shipping.md` updated; contract unchanged except examples (3, 5) and descriptions; task B1b added.
- L13 (coordinator): B1b Orca `task_a0fe870643a3` dispatch `ctx_18c6f1e468bc` on the backend terminal (worker branch synced to `ec309cb`).
- L14 (coordinator, B1b): worker_done succeeded (`05f655a`, merged `a262de6`). Evidence: `task backend:verify` exit 0 (PostgreSQL 18 up/down/up, rejected rows leave data unchanged, lint 0 issues, govulncheck clean, no sqlc drift); RED to GREEN observed; coverage domain 92.9 %, app 91.7 %, adapter 76.1 %. Migration 00002 has no backfill: rates with null or zero estimates block it until corrected.
- L15 (coordinator): B2 Orca `task_4b448d81c565` dispatch `ctx_4a28f03dc888` on the backend terminal (branch synced to `5813e0d`). Scope adds an exported catalog in-process read port and a minimal `internal/invoicing` module with the TaxCalculator port (Scenario A), because neither existed.
- L16 (coordinator answer to B2 question): demo fiscal profile keeps `tax_regime` null (informational, not fixed by Scenario A); zero VAT for all valid categories when `vat_responsible = false`; VAT-responsible profiles fail closed until the tax-inclusive pricing policy is decided.
- L17 (coordinator, B2): worker_done succeeded (merged `41facbe`). Evidence: `task backend:verify` exit 0 (PostgreSQL 18 up/down/up, HTTP contract success and error codes with field paths, orders/stock/movements unchanged on errors, CLI defaults catalog → shipping → orders, lint 0 issues, govulncheck clean, no sqlc drift); RED to GREEN observed; coverage orders domain 92.6 %, app 91.1 %. `contracttest` gained `DoInvalid` for contract-rejected requests.
- L18 (user, 2026-10-15): reservation expiry in B3 — "Sí, incluir el vencimiento (Recomendado)". Coordinator also documented `orders.idempotency_keys` (`docs/domain/orders.md` 3.7), required by the contract and api-conventions but not yet modeled.
- L19 (user, 2026-10-15): idempotent retry of order placement — "Token derivado con HMAC (Recomendado)". Tracking token = HMAC-SHA256(TRACKING_TOKEN_SECRET, Idempotency-Key), base64url 43 chars; only its SHA-256 hash is stored; `idempotency_keys.response_body` excludes the token. New backend secret `TRACKING_TOKEN_SECRET` added to `.env.example`; each developer adds it to the local `.env`.
- L20 (coordinator): B3 Orca `task_1b4e74cb8cfb` dispatch `ctx_4e9c3c55ff42` (branch synced to `578c694`). F1 worker finished (`ac538fe`, `e676dce`; claims 81 Vitest and 36 Playwright/axe passing) but sent no worker_done and omitted visual comparison notes; asked through its terminal to add the notes and send worker_done.
- L21 (coordinator answer to B3 question): an expired Idempotency-Key cannot place a second order (HMAC token would collide with the retained hash) and returns `422 idempotency_key_reused`; keys are normalized to lowercase UUID text before HMAC and locking. Recorded in `docs/domain/orders.md` 3.7.
- L22 (coordinator, F1): worker_done succeeded after a terminal reminder (merged `b1d78f5`). Worker evidence: `task frontend:verify` passed (0 audit vulnerabilities, astro check/tsc 0 errors, 81/81 Vitest, 36/36 Playwright with axe WCAG 2 A/AA desktop and mobile). Coordinator review: frontend-only diff, exact approved dependency versions, only existing colour tokens, cart store holds no prices. Finding: `/carrito` shows a "Cupón · Lo ingresas al pagar" row and the panel says coupons are entered at payment, contradicting L2; correction assigned to F2. Visual fidelity is not yet independently accepted (V1).
- L23 (coordinator): F2 Orca `task_b7ad214ca143` dispatch `ctx_446901784bcf` on the frontend terminal (branch synced to `74fa622`).
- L24 (coordinator answer to F2 question): the M-Listado, M-Listado-390 and M-Origen canvases have no add-to-cart on product cards, only the link to the detail page. Following AGENTS.md (replicate the approved composition, do not invent elements), cards keep that link and add-to-cart lives only in the product detail purchase island. S1 corrected; the original card wording was the coordinator's, not a user requirement.
- L25 (coordinator answer to B3 question): the contract's `GuestOrder.shipping.is_free_shipping` had no stored snapshot (coordinator omission). Added `orders.shipping_is_free_shipping boolean NOT NULL DEFAULT false` to `docs/domain/orders.md` 3.1; B3 adds it in orders migration 00002.
- L26 (coordinator, F2): worker_done succeeded (merged `0d8a1fc`). Worker evidence: `task frontend:verify` passed (0 audit vulnerabilities, no type drift, 0 check errors, 83/83 Vitest, 38/38 Playwright with axe desktop and 390 px, add-to-cart E2E). Coordinator review: frontend-only diff, coupon wording gone, ProductCard unchanged, prerender test still forbids prices and roast dates (only the obsolete no-add-to-cart assertion was removed). Visual fidelity pending V1.
- L27 (coordinator): F3 Orca `task_911b93ae6ae5` dispatch `ctx_ab2879869cf2` on the frontend terminal (branch synced to `ce2a7c6`).
- L28 (coordinator, B3): worker_done succeeded (merged `a6eb1eb`). Worker evidence: `task backend:verify` passed (0 lint issues, govulncheck clean); PostgreSQL 18 tests for last-unit concurrency, same-key concurrency, replay snapshots and guest privacy, expiry overlap and cleanup, expired-key rejection, free-shipping snapshot, compensation on persistence failure, validation leaving all data unchanged. Coordinator review: HMAC over lowercase key, only SHA-256 hash stored, idempotency response stored without token and recomputed on replay. New env `ORDER_MAINTENANCE_INTERVAL` (optional). Coordinator rerun of `task backend:verify` on `a6eb1eb` in progress.
- L29 (coordinator): independent rerun of `task backend:verify` on `a6eb1eb` exit 0 (all packages tested fresh, including PostgreSQL 18 suites; lint 0 issues; govulncheck clean). B3 closed.
- L30 (user, 2026-10-15): "recuerda que el agente frontend jamás se debe saltar el sistema de diseño ni inventarse nada, y que lleve muy bien la arquitectura de componentes y reutlización del componentes. Dime al final al nivel de estructura de carpetas que arquitectura fue la que se elgió para trabajar el fronent del ecommerce?" Coordinator: directive sent to the F3 worker; finding — cart line markup (image, name, quantity stepper, remove, line totals) is duplicated in `CartPanel.tsx` and `CartPage.tsx`, and the stepper again in `ProductPurchaseIsland.tsx`; task F1c added. No frontend folder architecture is documented in canonical docs (pending decision).
