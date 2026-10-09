---
name: payments-domain
description: "Trigger: payments, payment, Wompi, checkout widget, webhook, refund, void, settlement, withholding, pago, reembolso, pasarela. Apply payments domain invariants, Wompi integration, and settlement rules."
license: Apache-2.0
metadata:
  author: ecommerce-project
  version: "1.0"
---

## Activation Contract

Use when touching `backend/internal/payments`, the `payments` schema or migrations, Wompi checkout integration, payment webhooks, polling, refunds, or settlement ledgers.

Do not use alone for checkout order workflows. Load alongside: `backend-go-modules`, `database-postgres`, `domain-events-outbox`, `testing`; `frontend-astro-islands` for widget or `/admin`; `invoicing-taxes` for withholdings; `dependency-audit` before adding dependencies.

## Hard Rules

- Read `docs/domain/payments.md`, `docs/architecture/system-architecture.md`, `docs/architecture/data-modeling.md`, and `docs/architecture/invoicing-and-taxes.md` section 7.
- No cross-schema FKs or joins; foreign entities use plain `uuid`.
- Gateways plug behind `PaymentGateway` port via Go `net/http` without vendor SDKs.
- Currency COP; `amount_in_cents` matches `bigint` minor units. Primary keys are UUIDv7 (`id uuid PRIMARY KEY`).
- Wompi Advanced plan: 2.65% + COP 700 + 19% VAT on fee.
- Methods: `CARD`, `PSE`, `NEQUI`, `BANCOLOMBIA_TRANSFER` only; `BANCOLOMBIA_COLLECT` (cash slips) excluded.
- Server computes integrity signature: `SHA-256(reference + amount_in_cents + currency + expiration_time + integrity_secret)`.
- Widget payload includes `expiration-time` matching order `reservation_expires_at`.
- Outcomes trusted only from verified webhooks or private polling (`GET /v1/transactions/{id}`), never browser redirects.
- Webhook checksum validates `SHA-256(properties + timestamp + events_secret)`; properties read dynamically from `signature.properties`, never hardcoded.
- Webhook dedup in `provider_webhook_events` (`UNIQUE (provider, dedup_key)`, 30-day retention). Fast HTTP 200; outbox side effects.
- At most one approved attempt per order (`UNIQUE (order_id) WHERE status = 'approved'`).
- Refunds: automated card void if voidable; otherwise `manual` bank transfer confirmed in `/admin`.
- Cumulative completed refunds must not exceed attempt amount.
- Settlements entered from provider reports, never calculated; withholdings tracked here with net CHECK constraint.
- Secrets loaded from environment variables (`WOMPI_*`).

## Decision Gates

| Situation | Action |
| --- | --- |
| Secret management tooling | Stop and ask user (pending infrastructure baseline) |
| In-flight query endpoint | Stop and ask user; verify Wompi endpoint at implementation |
| Automated settlement import | Reject; deferred post-v1 (manual entry in v1) |
| Cash payment slips (`BANCOLOMBIA_COLLECT`) | Reject; conflicts with inventory holds |
| Requirement not in domain doc or open item | Stop and ask user; do not invent rules |

## Execution Steps

1. Read `docs/domain/payments.md` and related architecture.
2. Write failing tests first for critical payments invariants:
   - Integrity signature matches SHA-256 specification.
   - Webhook rejected on checksum mismatch or tampered properties.
   - Dynamic `signature.properties` parsing handles reordered fields.
   - Duplicate webhook checksum responds HTTP 200 without reprocessing.
   - At most one payment attempt reaches approved per order.
   - Completed refunds exceeding attempt amount rejected.
   - Settlement net amount constraint `gross - fee - fee_vat - withholdings = net` enforced.
3. Implement `domain/`, `app/`, and `adapters/` packages.
4. Create migrations per `database-postgres` (`goose`).
5. Run verification gates per `testing` and `backend-go-modules`.

## Output Contract

Report:
- Ports, adapters, webhook handlers, and migrations touched.
- Invariants covered by passing tests.
- Outbox events emitted (`payment_approved`, `payment_failed`, `refund_completed`).
- Pending secrets or Wompi verifications escalated to user.

## References

- `docs/domain/payments.md` — Canonical payments specifications.
- `docs/architecture/data-modeling.md` — Sections 3, 11 (data modeling, outbox).
- `docs/architecture/system-architecture.md` — Hexagonal design and ports.
- `docs/architecture/invoicing-and-taxes.md` — Section 7 (withholdings and settlements).
- `docs/domain/orders.md` — Late payment, refund, and grace contracts.
