# Feature: Cart & Checkout v1 (Orders & Shipping)

Browser cart, server-side checkout quote, guest order placement with a 30-minute stock reservation, and guest order view. Payment (Wompi), coupons, and invoice issuance are out of scope.
Rules: `AGENTS.md` section 5 and the `parallel-agents-orca` skill. Read this whole document up to `## Log` before working.

Canonical sources: `docs/architecture/api-conventions.md`, `docs/domain/orders.md`, `docs/domain/shipping.md`, `docs/architecture/invoicing-and-taxes.md`, `docs/design/monteluna/design-system.md`.
Reference canvas (desktop and `-390` mobile): `M-Carrito-Panel`, `M-Carrito`, `M-Checkout-Datos`, `M-Checkout-Pago`, `M-Pedido` under `docs/design/monteluna/canvas/`.
Contract: `contracts/openapi/orders.yaml` (no `shipping.yaml` in this wave, L2).

## Specs

### S1: Browser cart and header counter
- Cart state lives only in the browser (`localStorage` plus a reactive store). No cart table or server session.
- "Agregar al carrito" is enabled in the product detail purchase island and in the shared `ProductCard` for in-stock variants (lifts the Catalog v1 no-add-to-cart exception).
- Slide-over panel matches `M-Carrito-Panel` (desktop and 390); cart page `/carrito` matches `M-Carrito`.
- Lines show image, name, variant label, unit price, quantity controls (+, −, delete), and line total. Prices shown in the cart are read live from the catalog API, never stored as authoritative.
- The header badge shows the total item count on every page.
- No coupon field (L2).

### S2: Shipping zones and rates (`internal/shipping`)
- Schema `shipping` with `shipping_zones`, `shipping_zone_areas`, `shipping_rates` per `docs/domain/shipping.md`.
- Quote resolution is an in-process port consumed by `internal/orders`; no public HTTP endpoint (L2).
- Input: `municipality_code` (5-digit DIVIPOLA), `total_weight_grams`, `order_subtotal`. A municipality match wins over a department match (`left(municipality_code, 2)`); rate by weight band; cost `0` when the subtotal reaches the rate's free-shipping threshold.
- Output: rate name, shipping amount, free-shipping flag, estimated delivery days min and max. No matching zone or rate means the destination is unsupported.
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

### S5: Checkout and order view UI
- `/checkout` matches `M-Checkout-Datos` (step 2 of 3): buyer data, recipient ("Lo recibo yo" or another person), department and municipality selectors, address fields, optional invoice section, consent checkbox, live shipping quote state (quoted, free, no coverage), and order summary.
- Step 3 is a payment shell matching `M-Checkout-Pago` without a real payment; it states that payment is not yet available (Wompi is a later wave).
- `/pedido?token=…` (guest order view) matches `M-Pedido`: order number, reservation countdown while `pending_payment`, status steps, delivery address and recipient, estimated time, lines with image, variant, roast date and price, totals, and the origin block. Images and origin come from the catalog API by `product_slug`.

### S6: DIVIPOLA reference data
- Department and municipality selectors and the backend municipality validation use one versioned snapshot of the official DANE dataset "DIVIPOLA – Códigos municipios" (datos.gov.co `gdxc-w37w`, CC BY-SA 4.0, attribution to DANE), generated by a repository script; no npm dependency (L4). Pending user confirmation at Gate G3.

## Tasks

| ID | Task | Specs | Owner | Depends on | Commit |
| --- | --- | --- | --- | --- | --- |
| T1 | Feature document and Engram mirror | S1–S6 | coordinator | — | — |
| C1 | `orders.yaml` contract → Gate G3 (user approval) | S3, S4, S5 | coordinator draft (L1), backend owns later changes | T1 | — |
| D1 | DIVIPOLA snapshot script and data file with attribution | S6 | coordinator | G3 | — |
| B1 | Shipping schema, migrations, seed, and quote port | S2 | backend | G3 | — |
| B2 | Orders schema, migrations, quote endpoint, `TaxCalculator` port | S3 | backend | B1, D1 | — |
| B3 | Order placement, catalog allocation and release, order number, tracking token, outbox, guest order endpoint | S4, S5 | backend | B2 | — |
| F1 | Cart store, slide-over panel, `/carrito`, header badge | S1 | frontend | G3 | — |
| F2 | Enable "Agregar al carrito" in purchase island and `ProductCard` | S1 | frontend | F1 | — |
| F3 | `/checkout` data step and payment shell | S5, S6 | frontend | F1, D1 | — |
| F4 | Order placement integration and `/pedido` guest view | S4, S5 | frontend | F3 | — |
| I1 | Integrate branches, end-to-end checkout against the real API, `task verify` | all | coordinator | B3, F4 | — |
| V1 | Verification of every spec, including desktop and mobile visual comparison against canvas | all | verifier | I1 | — |

## Log

- L1 (user): "si ve prepando la OD y el contrato ve guardando en engram"
- L2 (user decisions, 2026-10-15): shipping quote "Solo puerto interno (Recomendado)"; invoice section "Sí, capturar y guardar (Recomendado)"; coupon "Fuera de esta ola (Recomendado)".
- L3 (coordinator review, 2026-10-15): first contract draft violated `api-conventions.md` (broken `common.yaml` references, `nullable: true`, per-field `currency`, missing `additionalProperties: false` and error codes, `processing` status) and did not match `M-Checkout-Datos` (buyer versus recipient, address line 2, postal code, consent, fiscal data). Rewritten; `kin-openapi` validation and `openapi-typescript` generation pass.
- L4 (user, DIVIPOLA source): "investigalo en la web o si existe librería para trabajar con esos códigos". Findings: official DANE dataset `gdxc-w37w` (1,122 rows: 1,103 municipalities, 18 non-municipalized areas, 1 island; updated 2025-01-24; CC BY-SA 4.0); npm `colombia-cities` 1.0.0 and `colombia-territorial` 1.1.0 are single-maintainer packages with unverified provenance. Recommendation: repository snapshot of the official dataset.
- L5 (coordinator, from `M-Pedido`): guest view needs recipient phone, estimated delivery days, roast date, product image, and origin. Added `orders.shipping_estimated_days_min/max` and `order_lines.product_slug` to `docs/domain/orders.md`.
