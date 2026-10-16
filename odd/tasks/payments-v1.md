# Feature: Payments v1 (Wompi, no admin)

Wompi Web Checkout widget on checkout step 3, server-side integrity signature, verified webhooks with polling fallback, the outbox relay, order payment confirmation including late payments, and the in-flight payment grace. Refund execution, card voids, settlements, `/admin`, and emails are out of scope (L2).
Rules: `AGENTS.md` section 5 and the `parallel-agents-orca` skill. Read this whole document up to `## Log` before working.

Canonical sources: `docs/domain/payments.md`, `docs/domain/orders.md`, `docs/architecture/data-modeling.md` section 11, `docs/architecture/api-conventions.md`, `docs/design/monteluna/design-system.md`.
Reference canvas (desktop and `-390` mobile): `M-Checkout-Pago` (states "Por pagar", "Ventana de pago"; "Sin existencias" is the placement failure) and `M-Pedido` (states "Pagado", "Confirmando", "Rechazado", "Vencido") under `docs/design/monteluna/canvas/`.
Contracts: new `contracts/openapi/payments.yaml`; changes to `contracts/openapi/orders.yaml` (guest order payment data).

## Specs

### S1: Payment start and integrity signature
- From checkout step 3, "Pagar" asks the backend to start a payment attempt for a placed order in `pending_payment` whose reservation has not expired. The request is authorized by the order's tracking token (no buyer account).
- The backend inserts a `payments.payment_attempts` row (`status = 'created'`, unique random `reference` per attempt, `amount` = order total, `currency = 'COP'`, `expires_at` = order `reservation_expires_at`) and returns the Wompi widget parameters: public key, currency, `amount_in_cents`, reference, `signature:integrity`, `expiration-time`, and the redirect URL to the order view.
- `integrity_signature = SHA-256(reference + amount_in_cents + currency + expiration_time + integrity_secret)`, computed only in `internal/payments`; no secret reaches the browser.
- `amount_in_cents` equals the internal `bigint` minor units of the order total (COP 45,000 = `4500000`); the client never supplies an amount.
- A buyer may start a new attempt after a decline or error while the order is still `pending_payment` and unexpired; an order never has more than one `approved` attempt (`UNIQUE (order_id) WHERE status = 'approved'`).
- Exact endpoint path, request, response, and error codes are defined by contract C1 and approved by the user (Gate G1).

### S2: Wompi webhook
- `POST` webhook endpoint under `/api/v1/payments/webhooks/wompi` (final path in C1) receives `transaction.updated`.
- Checksum: `SHA-256(concatenated_property_values + timestamp + events_secret)` compared with `X-Event-Checksum`; the property paths are read dynamically from `signature.properties` in the payload, in that order, never hard-coded. A mismatch, tampered property, or missing checksum is rejected and changes nothing.
- Deduplication in `payments.provider_webhook_events` (`UNIQUE (provider, dedup_key)`, `dedup_key` = event checksum): a repeated event returns HTTP 200 without reprocessing.
- Wompi statuses map to `payment_attempts.status`: `PENDING → pending`, `APPROVED → approved`, `DECLINED → declined`, `VOIDED → voided`, `ERROR → error`; `provider_transaction_id`, `payment_method_type` (`CARD`, `PSE`, `NEQUI`, `BANCOLOMBIA_TRANSFER`), `status_message`, and `finalized_at` are recorded. A late or repeated event never moves an attempt out of a terminal status.
- The handler answers 2xx promptly. In the same transaction as the status change it writes `payments.payment_approved` or `payments.payment_failed` to `payments.outbox`; cross-module effects run only through the relay (S4).
- Rows older than 30 days are purged by a scheduled cleanup.

### S3: Polling fallback
- Payment outcomes are trusted only from a verified webhook or a backend query with the private key (`Authorization: Bearer prv_…`), never from the browser redirect.
- When the buyer lands on the order view before the webhook arrives, and when the expiry worker inspects in-flight attempts (S5), the backend queries Wompi (`GET /v1/transactions/{id}`, or by reference when the transaction id is not yet known) and applies the same status mapping, events, and terminal-status guard as S2.
- The exact Wompi endpoint for querying by reference is an open item in `docs/domain/payments.md` section 4; C1 confirms it against the official Wompi documentation and reports it to the user at Gate G1.

### S4: Outbox relay and order payment confirmation
- An in-process relay in `backend/internal/platform` delivers every module's outbox rows per `docs/architecture/data-modeling.md` section 11: claims with `SELECT … FOR UPDATE SKIP LOCKED`, polls every 1 second in batches of up to 100, at-least-once delivery, failed events retried with backoff and never deleted automatically, delivered events and `processed_events` kept 7 days with hourly cleanup. Values come from configuration with those defaults.
- Every consumer is idempotent: it inserts the event `id` into its own schema's `processed_events` with `ON CONFLICT DO NOTHING` in the same transaction as its effect and skips the effect when no row was inserted.
- `orders` consumes `payments.payment_approved`:
  - `pending_payment → paid`: sets `paid_at`, writes `order_status_history`, publishes `orders.order_paid`.
  - Late payment on an `expired` order: re-allocates stock through the catalog port. Success: `expired → paid` with an audit note and `orders.order_paid`. Insufficient stock: `expired → cancelled` with an audit note and `orders.order_cancelled` with reason `late_payment_no_stock`.
  - A repeated or late event never moves an order backwards.

### S5: In-flight payment grace
- Before expiring a `pending_payment` order whose `reservation_expires_at <= now()`, the expiry worker asks `payments` (in-process port) whether an attempt is in flight (status `pending` at Wompi, confirmed with S3).
- In flight: `reservation_expires_at` is extended in 15-minute steps, never beyond 2 hours from `placed_at`.
- Not in flight, declined or failed, or the 2-hour ceiling reached without approval: the existing expiry (status `expired`, history, stock release, `orders.order_expired`) runs unchanged.

### S6: Refund record without admin (L2)
- `payments` consumes `orders.order_cancelled` for an order with an approved attempt (including `late_payment_no_stock`) and creates one `payments.refunds` row: `method = 'manual'`, `status = 'pending'`, the matching `reason`, `amount` = approved attempt amount; plus one ERROR-level structured log naming the order number and amount so the merchant can act.
- No card void call, no `/admin` screen, no email in this feature. Completed refunds never exceed the attempt amount (domain check).

### S7: Storefront payment UI
- Checkout step 3 matches `M-Checkout-Pago` (desktop and 390): payment methods remain informational; "Pagar" (enabled) starts the attempt (S1) and opens the Wompi widget ("Ventana de pago" state); closing it returns to "Por pagar". The canvas "Sin existencias" state belongs to order placement ("No creamos el pedido ni te cobramos nada") and stays as built for L40. When the backend refuses to start a payment because the reservation expired, the step sends the buyer to `/pedido?token=…`, which shows "Vencido"; the canvas has no payment-step state for this case, so the user confirms this behavior at Gate G1. The Wompi widget script is a third-party dependency and is added only after Gate G2.
- Wompi's redirect lands on `/pedido?token=…`, which treats the redirect only as a hint, asks the backend to verify (S3), and shows the server status in the `M-Pedido` variants: "Pagado" (`paid`, with the real payment method, e.g. "Pagado con Nequi"), "Confirmando" (payment pending), "Rechazado" (last attempt declined or error; the order can still be paid while reserved), "Vencido" (`expired`).
- No amounts, statuses, or payment methods are invented or hard-coded from the canvas; the guest order response carries the payment data (C1).

### S8: Configuration and secrets
- `WOMPI_PUBLIC_KEY`, `WOMPI_PRIVATE_KEY`, `WOMPI_INTEGRITY_SECRET`, `WOMPI_EVENTS_SECRET`, `WOMPI_ENVIRONMENT` (`sandbox` or `production`) come only from environment variables, validated at startup; `.env.example` gets safe placeholders; secrets are never logged, committed, or put in task specs.
- No sandbox keys exist yet (L2): automated tests use a fake gateway and signed fixtures; the manual sandbox test is pending until the user adds keys to their local `.env`. No tunnel for local webhooks (L2): locally, polling (S3) confirms payments.

## Tasks

| ID | Task | Specs | Owner | Depends on | Commit |
| --- | --- | --- | --- | --- | --- |
| T1 | Feature document and Engram mirror | S1–S8 | coordinator | — | — |
| C1 | `payments.yaml` (payment start, webhook, payment verification) and `orders.yaml` guest order payment data; confirm the Wompi query-by-reference endpoint from official docs → Gate G1 | S1, S2, S3, S7 | backend | T1 | — |
| A1 | Dependency audit of the Wompi widget script (source URL, integrity, CSP impact) → Gate G2 | S7 | coordinator | T1 | — |
| B1 | Outbox relay and consumer `processed_events` support in `internal/platform`, with cleanup | S4 | backend | G1 | — |
| B2 | `payments` schema and migrations (`payment_attempts`, `refunds`, `provider_webhook_events`, `outbox`, `processed_events`), Wompi gateway adapter over `net/http`, configuration, payment start endpoint with integrity signature | S1, S8 | backend | G1 | — |
| B3 | Webhook verification, deduplication, status mapping, outbox events, polling fallback, webhook event cleanup | S2, S3 | backend | B2 | — |
| B4 | Orders consumer of `payment_approved` (paid, late payment re-allocation or cancel), in-flight grace in the expiry worker, payments consumer of `order_cancelled` creating the pending manual refund; guest order payment data | S4, S5, S6 | backend | B1, B3 | — |
| F1 | Checkout step 3: enable "Pagar", start attempt, open the Wompi widget, canvas states | S7 | frontend | G1, G2 | — |
| F2 | `/pedido`: backend verification on load after redirect, "Pagado", "Confirmando", "Rechazado", "Vencido" from server data with real payment method | S7 | frontend | G1 | — |
| I1 | Integrate branches, end-to-end checkout with a fake Wompi gateway, `task verify` | all | coordinator | B4, F1, F2 | — |
| V1 | Verification of every spec, including desktop and mobile visual comparison against canvas | all | verifier | I1 | — |

Gates: G1 contract approval (C1); G2 Wompi widget script approval (A1). Nothing runs in parallel before G1.

## Log

- L1 (user, 2026-10-16): "ya está main si quires verifica y dime lo siguiente que vamos a trabajar hoy". Coordinator recommended Payments v1 without admin.
- L2 (user decisions, 2026-10-16): scope "Pagos v1 sin admin (Recomendado)" — "Widget Wompi, firma, webhook, polling, pedido pagado y gracia tardía. Reembolsos y liquidaciones después de Identidad."; late payment without stock: "Registrar reembolso pendiente (Recomendado)" — "Se crea el registro de reembolso manual pendiente y se registra un log de error; la anulación automática de tarjeta y el panel llegan con Identidad."; local webhooks: "Sin túnel por ahora (Recomendado)" — "En local confirma el polling de respaldo; el webhook se prueba con eventos firmados en tests. Sin dependencias nuevas."; Wompi sandbox keys: "Todavía no" — "Construimos con un gateway falso en tests; la prueba manual queda pendiente hasta que las tengas."; work mode: "Orca con workers en paralelo".
- L3 (coordinator, 2026-10-16): exploration findings. The outbox relay is approved (`data-modeling.md` section 11) but not built; modules only write outbox rows. `M-Checkout-Pago` lists payment methods as information and "Pagar" opens the Wompi window, consistent with the approved widget integration. `/pedido` already renders confirming and rejected hero variants, but `GuestOrder` carries no payment data and `OrderSummaryAside` shows a fixed "Pagado con Wompi". Scoping: the `settlements` and `settlement_items` tables arrive with the admin feature, since nothing writes them in v1.
