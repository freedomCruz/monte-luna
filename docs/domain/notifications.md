# Notifications Domain

Canonical requirements and data model for the `notifications` module. Conventions in [data-modeling.md](../architecture/data-modeling.md) apply to every table below.

## 1. Status

| Item | Status |
|---|---|
| Outbox consumer module architecture (`internal/notifications`) | Approved |
| Transactional email provider: Resend via `net/http` behind `EmailSender` port (no SDK) | Approved |
| Swappable adapter design (Postmark documented alternative) | Approved |
| Asynchronous delivery flow and Resend idempotency keys | Approved |
| Delivery webhooks and suppression list handling | Approved |
| Template system: Go `html/template` + plain text embedded in binary | Approved |
| Data model (section 3) | Approved |
| Retention policy: `template_data` cleared after 90 days; `recipient_email` anonymized after 2 years; suppressions kept without expiry | Approved |
| Domain configuration and DNS records (SPF, DKIM, DMARC) | Pending (blocks delivery) |
| Dedicated sending subdomain recommendation | Pending (domain decision) |
| Customer-facing email language: Spanish | Approved |
| Email copy and tone | Pending (defined with each template) |
| Legal review: cross-border data transfer under Ley 1581 | Pending |

## 2. Approved Requirements

**Module and consumer architecture**
- Resides in `internal/notifications`, with dedicated database schema `notifications`.
- Consumes domain events emitted to PostgreSQL transactional outbox tables by other modules (`identity.password_reset_requested` and `identity.admin_invited` initially; order confirmations, shipment notices, and payment receipts in subsequent iterations).
- Operates as an idempotent consumer tracking handled messages in `notifications.processed_events`.

**Provider and integration strategy**
- **Provider:** Resend (https://resend.com/pricing: Free tier includes 3,000 emails/month capped at 100 emails/day; Pro tier US$20/month for 50,000 emails; sending region options include `sa-east-1` São Paulo; email and metadata stored in the United States).
- **Lightweight integration:** Standard library `net/http` calling the Resend REST API behind an `EmailSender` port interface. No third-party SDK is used, avoiding unnecessary external dependencies.
- **Swappability:** The clean port boundary ensures the adapter can be swapped with minimal effort (Postmark is the primary documented fallback alternative).

**Delivery workflow**
1. An event is picked up by the outbox relay and delivered to the `notifications` consumer.
2. The consumer deduplicates using `notifications.processed_events`.
3. Suppression check: If the recipient address exists in `notifications.email_suppressions`, the message is recorded in `email_messages` with status `'suppressed'` and provider dispatch is skipped.
4. Template rendering: Go `html/template` and text fallback are rendered with event payload data.
5. A row is inserted into `notifications.email_messages` with status `'pending'`.
6. Dispatch: The adapter issues a POST request to `https://api.resend.com/emails` containing the header `Idempotency-Key: <email_messages.id>`. Resend keys support up to 256 characters and expire after 24 hours (https://resend.com/docs/dashboard/emails/idempotency-keys).
7. Upon successful acceptance by Resend, the record stores `provider_message_id` and transitions to `'sent'`.
8. If the provider call fails (network timeout, rate limit, HTTP 5xx), the consumer returns an error so the outbox relay retries the event with exponential backoff.
9. **Critical isolation invariant:** An external email outage or delivery failure never fails, rolls back, or blocks a business transaction (e.g., placing an order, confirming a payment, or generating a password reset token).

**Delivery webhooks**
- Inbound HTTP endpoint under `/api` (exact path finalized at implementation) receives Resend delivery webhooks.
- Signatures verified via Resend webhook signing secret using Go standard library crypto (https://resend.com/docs/webhooks/verify-webhooks-requests).
- Webhook events are deduplicated via `notifications.provider_webhook_events` by `(provider, external_event_id)`.
- **Webhook edge behavior (approved 2026-10-20):** A correctly signed but unsupported event type returns HTTP 200 without effects, so future provider event types do not cause retries. A supported event whose provider email ID is not yet present returns HTTP 503 and is not recorded in the deduplication ledger, allowing recovery from the send/webhook race on retry. Signature timestamps are accepted only within five minutes before or after server time to reject replayed or implausibly future requests.
- Permanent delivery failures (`email.bounced` with hard bounce) and spam complaints (`email.complained`) automatically record the recipient in `notifications.email_suppressions`. Successful deliveries (`email.delivered`) update `email_messages.status` to `'delivered'`.

**Templates**
- Standard library `html/template` combined with a mandatory plain-text alternative.
- Templates are embedded into the Go application binary via `embed`, eliminating external template dependencies.
- Customer-facing emails are written in Spanish. Template identifiers, code, and comments stay in English. Copy and tone are defined with each template.
- Identity v1 includes two distinct templates: password recovery and administrator invitation. Both decrypt the event token only in memory to build a single-use link and never persist the plaintext token or complete link.

## 3. Approved Data Model (schema `notifications`)

Common columns, omitted from the tables below unless noted:
- `id uuid PRIMARY KEY` (UUIDv7) on every table.
- `created_at timestamptz NOT NULL DEFAULT now()` and `updated_at timestamptz NOT NULL DEFAULT now()` on mutable tables.
- Notification tables are updated by backend workers and webhooks; they are not directly modified through the merchant panel, so optimistic locking `version` is not required.

```text
email_messages ──< email_suppressions (optional FK source_message_id)

provider_webhook_events (deduplication ledger)

processed_events (outbox consumer deduplication)
```

### 3.1 `email_messages`

| Column | Type | Rules |
|---|---|---|
| `source_event_id` | `uuid` | Not null, `UNIQUE`; originating outbox event ID enforcing delivery idempotency |
| `template_key` | `text` | Not null; `CHECK (template_key ~ '^[a-z][a-z0-9_]*$')` |
| `recipient_email` | `text` | Nullable; set while the message is retained and anonymized (`NULL`) after 2 years, see section 3.5 |
| `template_data` | `jsonb` | Not null, default `'{}'`; template rendering variables (contains personal data; secrets such as raw reset tokens are NEVER stored here) |
| `status` | `text` | Not null, default `'pending'`; `CHECK (status IN ('pending','sent','delivered','bounced','complained','failed','suppressed'))` |
| `provider` | `text` | Not null, default `'resend'` |
| `provider_message_id` | `text` | Nullable, `UNIQUE`; identifier returned by email provider |
| `attempts` | `integer` | Not null, default `0`; `CHECK (attempts >= 0)` |
| `last_error` | `text` | Nullable; last error message on dispatch failure |
| `sent_at` | `timestamptz` | Nullable; timestamp when accepted by provider |
| `created_at` | `timestamptz` | Not null, default `now()` |
| `updated_at` | `timestamptz` | Not null, default `now()` |

Partial index: `(created_at) WHERE status IN ('pending','failed')` to facilitate retry monitoring and operational alerts.

### 3.2 `email_suppressions`

| Column | Type | Rules |
|---|---|---|
| `email` | `text` | Not null, `UNIQUE`; `CHECK (email = lower(email))` |
| `reason` | `text` | Not null; `CHECK (reason IN ('hard_bounce','complaint','manual'))` |
| `source_message_id` | `uuid` | Nullable; FK → `email_messages(id)` ON DELETE SET NULL |
| `created_at` | `timestamptz` | Not null, default `now()` |

Note: Append/lookup table; no `updated_at` column.

### 3.3 `provider_webhook_events`

Deduplication table for incoming provider webhooks. Follows the pattern in [data-modeling.md](../architecture/data-modeling.md) section 11.

| Column | Type | Rules |
|---|---|---|
| `provider` | `text` | Not null |
| `external_event_id` | `text` | Not null |
| `event_type` | `text` | Not null |
| `received_at` | `timestamptz` | Not null, default `now()` |

Table constraint: `UNIQUE (provider, external_event_id)`.  
Retention: 30 days, matching webhook deduplication standards.

### 3.4 `processed_events`

Idempotent consumer event tracking per [data-modeling.md](../architecture/data-modeling.md) section 11.

| Column | Type | Rules |
|---|---|---|
| `event_id` | `uuid` | `PRIMARY KEY` (originating outbox event ID) |
| `event_type` | `text` | Not null |
| `processed_at` | `timestamptz` | Not null, default `now()` |

Retention: 7 days, matching standard consumer outbox deduplication.

### 3.5 Retention Policy (approved)

- `processed_events`: Rows older than 7 days deleted by cleanup worker.
- `provider_webhook_events`: Rows older than 30 days deleted by cleanup worker.
- `email_messages.template_data`: Cleared (`UPDATE email_messages SET template_data = '{}' WHERE created_at < now() - INTERVAL '90 days'`) after 90 days. `notifications` needs this copy only to render and resend the email; customer and order data of record live in `orders` under their own retention rules.
- `email_messages.recipient_email`: Anonymized (`SET recipient_email = NULL`) after 2 years. The row (`template_key`, `status`, `sent_at`, `provider_message_id`) is kept for delivery statistics without personal data. Within the 2 years it supports disputes such as "the confirmation never arrived".
- `email_suppressions.email`: Kept without expiry. Deleting it would resume sending to addresses that bounced or complained, harming sender reputation.
- Rationale: purpose limitation under Ley 1581 (personal data is kept only while it serves its purpose) and a smaller exposure in case of a breach.

## 4. Prerequisites and Compliance

**Domain authentication and deliverability**
- Sending transactional emails requires an owned domain with DNS records configured for SPF, DKIM, and DMARC alignment.
- Adherence to Google and Yahoo bulk and transactional sender guidelines: https://support.google.com/mail/answer/81126.
- **Architectural recommendation:** Configure a dedicated sending subdomain (e.g., `mail.<domain>` or `notifications.<domain>`) to isolate transactional email sender reputation from apex domain web traffic and potential future marketing communications.

**Data protection and privacy regulations**
- Resend processes and stores email payloads on infrastructure situated in the United States.
- Colombian Statutory Law 1581 of 2012 (Ley 1581 de Protección de Datos Personales, Article 26) regulates the international transfer of personal data to countries lacking equivalent data protection adequacy, requiring explicit customer authorization or standard contractual clauses.
- Prior to handling real customer communications in production:
  - Publish a comprehensive Privacy Policy (Política de Tratamiento de Datos Personales) informing users of international processing.
  - Obtain express consent during storefront checkout or account interactions.
  - Review and sign Resend's Data Processing Addendum (DPA).
- *Disclaimer:* This assessment provides architectural and technical context and does not constitute formal legal counsel. Review with qualified legal advisors prior to commercial launch.

## 5. Open Items

- Domain registration and DNS configuration (SPF, DKIM, DMARC, dedicated sending subdomain).
- Email copy and tone, defined with each template.
- Privacy policy formulation and legal review under Ley 1581.

## 6. Sources

- Resend Pricing: https://resend.com/pricing
- Resend Emails API Reference: https://resend.com/docs/api-reference/emails
- Resend Idempotency Keys: https://resend.com/docs/dashboard/emails/idempotency-keys
- Resend Webhooks Signature Verification: https://resend.com/docs/webhooks/verify-webhooks-requests
- Google Sender Guidelines: https://support.google.com/mail/answer/81126
- Postmark (Fallback Provider): https://postmarkapp.com/
