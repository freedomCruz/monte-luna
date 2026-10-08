# Payments and Promotions Domain Models

## Goal and scope

Document the approved `payments` and `promotions` data models, the late-payment flow, and the related `orders` adjustments.

Approved decisions (2026-10-08):
1. Wompi is the main payment gateway, Advanced (aggregator) plan: 2.65% + COP 700 + VAT per approved transaction. v1 methods: `CARD`, `PSE`, `NEQUI`, `BANCOLOMBIA_TRANSFER`; no cash at correspondents.
2. Late payments: Wompi `expiration-time` equals the reservation expiry; before releasing stock, an in-flight payment extends the reservation up to a 2-hour maximum from placement; a late approved payment re-allocates stock if available (`expired → paid`), otherwise the order is cancelled (`expired → cancelled`) and a refund is required (card void when possible, manual refund otherwise) and the buyer is emailed.
3. Payments model: `payment_attempts`, `refunds` ✎, `settlements` ✎, `settlement_items`, `provider_webhook_events`, `outbox`, `processed_events`.
4. Promotions model: `coupons` ✎ (`percentage` with optional cap, `free_shipping`; validity dates, minimum order, total uses, uses per email, atomic usage counter), `coupon_redemptions` (`reserved`, `confirmed`, `released`), `outbox`, `processed_events`. Codes only, one coupon per order.
5. Orders adjustments: transitions `expired → paid` and `expired → cancelled`; `coupon_code` and `shipping_discount_amount`; total = subtotal − discount + shipping − shipping discount + tax; percentage discount on product subtotal before tax, allocated proportionally across lines.

## Tasks

- [x] T1 — Write `docs/domain/payments.md` and `docs/domain/promotions.md`; update `orders.md`, `system-architecture.md`, `invoicing-and-taxes.md` if needed, `data-modeling.md`, and `AGENTS.md` (completed: domain specs created, orders adjusted, and architecture references synchronized).
- [x] T2 — Read-only consistency check.
  - Result: no remaining Stripe or "selected gateway" placeholders; orders total CHECK includes the shipping discount; 2-hour grace and late-payment transitions present; `AGENTS.md` links resolve.
- [x] T3 — Commit and report.

## Verification and delivery

- TDD: not applicable; documentation only.
- Commit: authorized through the approval flow on 2026-10-08.
