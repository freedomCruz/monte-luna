---
name: notifications-domain
description: "Trigger: notifications, email, transactional email, Resend, template, correo, plantilla, mensaje, suppression, rebote. Apply notifications domain invariants, transactional email delivery, and suppression rules."
license: Apache-2.0
metadata:
  author: ecommerce-project
  version: "1.0"
---

## Activation Contract

Use when touching `backend/internal/notifications`, the `notifications` schema or migrations, email templates, delivery webhooks, or transactional email dispatch.

Do not use for publishing events from other modules. Load alongside: `backend-go-modules`, `database-postgres`, `domain-events-outbox`, `testing`; `dependency-audit` before adding HTTP or template dependencies.

## Hard Rules

- Read `docs/domain/notifications.md`, `docs/architecture/system-architecture.md`, and `docs/architecture/data-modeling.md` before implementing.
- No cross-schema FKs or joins; foreign events referenced strictly by plain `uuid` (`source_event_id`).
- Other modules trigger notifications exclusively through outbox events.
- Primary keys are UUIDv7 (`id uuid PRIMARY KEY`). Tables updated by workers and webhooks; admin `version` locking not required.
- Module consumes domain events only (password reset, order and shipment notices).
- Delivery is asynchronous and idempotent: deduplication via `notifications.processed_events` (7-day retention) and unique `source_event_id` in `email_messages`.
- Suppression check before sending: if recipient is in `notifications.email_suppressions`, set status `'suppressed'` and skip provider dispatch.
- Resend integration uses Go `net/http` behind an `EmailSender` port without SDKs; Postmark is swappable alternative.
- Dispatch sends header `Idempotency-Key: <email_messages.id>`.
- External delivery failure or provider outage never fails, reverts, or blocks triggering business transactions.
- Delivery webhooks require signature verification; deduplicated in `provider_webhook_events` (30-day retention); hard bounces and complaints populate `email_suppressions`.
- Never persist secrets (such as raw reset tokens) in database or logs.
- Templates use Go `html/template` plus text fallback via `embed`.
- Customer copy is Spanish; code, template keys, and comments remain in English.
- Retention: `template_data` cleared after 90 days; `recipient_email` anonymized (`NULL`) after 2 years; `email_suppressions` retained indefinitely.

## Decision Gates

| Situation | Action |
| --- | --- |
| Domain DNS records missing | Stop and ask user (pending SPF, DKIM, DMARC config) |
| Specific email copy or tone requested | Stop and ask user (defined with each template) |
| Ley 1581 cross-border transfer review | Stop and ask user (pending legal review) |
| Recipient in suppression list | Record status `'suppressed'`; skip provider call |
| Provider failure or timeout | Return error to outbox relay for retry; do not block business flow |
| Requirement not in domain doc or open item | Stop and ask user; do not guess delivery rules |

## Execution Steps

1. Read `docs/domain/notifications.md` and outbox architecture sections.
2. Write failing tests first for critical notification invariants:
   - Duplicate event executes idempotently, sending one email.
   - Suppressed recipient records `'suppressed'` without invoking `EmailSender`.
   - Dispatch failure does not abort originating transaction.
   - Decrypted secrets excluded from `template_data` persistence.
   - Invalid webhook signature rejected with HTTP 401.
   - Webhook bounce and complaint populate `email_suppressions`.
3. Implement `EmailSender` port, consumers, and Resend adapter.
4. Create migrations per `database-postgres` (`goose`).
5. Run verification gates per `testing` and `backend-go-modules`.

## Output Contract

Report:
- Handled events, templates, ports, adapters, and migrations.
- Invariants covered by passing tests.
- Retention policies configured.
- Pending DNS or regulatory items escalated to user.

## References

- `docs/domain/notifications.md` — Canonical notifications specifications.
- `docs/architecture/system-architecture.md` — Section 4 (bounded contexts) and Section 6 (Resend).
- `docs/architecture/data-modeling.md` — Section 11 (Outbox, consumer deduplication).
- `docs/domain/identity.md` — Password reset outbox event contract.
