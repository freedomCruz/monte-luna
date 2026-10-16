# Payments Domain

Canonical requirements and data model for the `payments` module. Conventions in [data-modeling.md](../architecture/data-modeling.md) apply to every table below.

## 1. Status

| Item | Status |
|---|---|
| Dedicated module (`internal/payments`, schema `payments`) | Approved |
| Payment gateway: Wompi Colombia, Advanced aggregator plan (2.65% + COP 700 + VAT) | Approved |
| Payment methods: `CARD`, `PSE`, `NEQUI`, `BANCOLOMBIA_TRANSFER` | Approved |
| Integration via Wompi Web Checkout widget with server-side integrity signature | Approved |
| Widget script loaded only on checkout step 3 when the buyer presses "Pagar"; Wompi's injected fraud scripts (Sift, ClearSale) accepted; Content-Security-Policy defined with deployment (2026-10-16) | Approved |
| New attempt blocked while the order has a known `pending` attempt; a second approval still arriving creates a pending manual refund (`duplicate_payment`) (2026-10-16) | Approved |
| Webhook verification with dynamic `signature.properties` checksum and 30-day dedup | Approved |
| Fallback polling via `GET /v1/transactions/{id}` with private key | Approved |
| Status mapping (`PENDING`, `APPROVED`, `DECLINED`, `VOIDED`, `ERROR`) | Approved |
| Single currency: COP (`amount_in_cents` matching internal `bigint` minor units) | Approved |
| Late-payment defense (expiration-time, 2-hour grace, re-allocation or refund) | Approved |
| Refunds (`card_void` automated, `manual` bank transfer with admin confirmation) | Approved |
| Settlements and withholdings ledger (manual entry in v1 per provider report) | Approved |
| Data model (section 3) | Approved |
| Secret management tooling (env variables in v1, `0600` env file on VPS) | Approved |
| Automated settlement report import (API / CSV upload) | Deferred (post-v1) |
| Query by reference (`GET /v1/transactions?reference=`): undocumented; used only inside the Wompi adapter as a fallback when no transaction id is known; must be confirmed with sandbox keys before production (2026-10-16) | Approved (sandbox confirmation pending) |

## 2. Approved Requirements

**Module responsibility and scope**
- Resides in `internal/payments` with isolated PostgreSQL schema `payments`.
- Owns gateway adapter integrations, payment attempt lifecycles, incoming webhook verification and deduplication, card voids, refund tracking, and merchant settlement reconciliation.
- Integrates behind a clean `PaymentGateway` port interface (`internal/payments/domain/ports.go`), implemented via standard library `net/http` without third-party vendor SDKs.

**Payment gateway and commercial plan**
- **Gateway:** Wompi Colombia (Bancolombia group).
- **Plan:** Advanced (aggregator model / *modelo agregador*).
- **Tariff:** 2.65% + COP 700 + VAT (19% on the fee/commission) per approved transaction (https://wompi.co/es/co/planes-tarifas/).
- **Supported payment methods in v1:**
  - `CARD`: Credit and debit cards (Visa, Mastercard, American Express) with CVV and 3D Secure where required.
  - `PSE`: Pagos Seguros en Línea (direct debits from Colombian bank checking and savings accounts).
  - `NEQUI`: Nequi digital wallet (push notification / phone approval).
  - `BANCOLOMBIA_TRANSFER`: Botón Bancolombia / transfer from Bancolombia accounts.
- **Excluded in v1:**
  - `BANCOLOMBIA_COLLECT` (cash payment at correspondent banking locations / *Corresponsales Bancarios*): excluded because cash payment slips remain valid for up to 72 hours, which conflicts with inventory holds and short reservation cycles.

**Checkout integration (Widget / Web Checkout)**
- The browser storefront displays the Wompi Web Checkout widget (or redirects to Web Checkout) using parameters provided by the backend during checkout initiation.
- **Server-side integrity signature:** To prevent client-side manipulation of payment amounts or order identifiers, Wompi requires an integrity signature:
  ```text
  integrity_signature = SHA-256(reference + amount_in_cents + currency + expiration_time + integrity_secret)
  ```
- The integrity signature is strictly calculated on the server inside `internal/payments` and returned in the checkout response. Secrets are never exposed to the client.
- **Expiration time parameter:**
  - Wompi accepts an ISO 8601 UTC timestamp (`expiration-time`) in the checkout widget payload (https://docs.wompi.co/docs/colombia/widget-checkout-web/).
  - Set to match the order's `reservation_expires_at`.
  - **Behavioral invariant:** Per Wompi documentation, `expiration-time` only prevents a buyer from *starting* a new payment attempt after that timestamp. It does not abort or interrupt a transaction that is already in progress (e.g., a customer actively completing authentication on their bank's PSE portal).

**Backend verification, webhooks, and polling fallback**
- Payment outcomes are trusted **only** when verified directly by the backend. The storefront redirect return page is treated as an unverified visual hint; it never marks an order paid.
- **Webhook endpoint:**
  - Receives asynchronous HTTP POST notifications from Wompi (event `transaction.updated`).
  - Located under `/api/v1/payments/webhooks/wompi` (final path confirmed at implementation).
  - **Checksum verification:** Every event includes header `X-Event-Checksum`. The checksum must match:
    ```text
    checksum = SHA-256(concatenated_property_values + timestamp + events_secret)
    ```
    The `concatenated_property_values` string is built by reading the property paths listed in `signature.properties` in the incoming payload in exact sequence (https://docs.wompi.co/docs/colombia/eventos/). These properties are **read dynamically from the payload and never hard-coded**, ensuring resilience if Wompi adds or reorders signature fields.
  - **Deduplication:** Webhooks are recorded in `payments.provider_webhook_events` with unique constraint `(provider, dedup_key)` where `dedup_key` is the event checksum. If already present, the endpoint responds HTTP 200 immediately without reprocessing.
  - **Fast response:** The webhook handler responds HTTP 2xx promptly. Any cross-module side effects (such as updating order state) execute asynchronously via the transactional outbox.
- **Fallback polling:**
  - Backend queries `GET /v1/transactions/{id}` authenticated with the Wompi private key (`Authorization: Bearer prv_...`) when a buyer lands on the return page before webhook delivery, or when the order expiry job inspects in-flight transactions.

**Status mapping and amounts**
- **Wompi statuses:** `PENDING`, `APPROVED`, `DECLINED`, `VOIDED`, `ERROR`.
- **Internal `payment_attempts.status`:**
  - `created`: Attempt initialized, checkout widget parameters issued.
  - `pending`: Transaction in progress at provider (e.g., customer redirected to bank).
  - `approved`: Payment confirmed and captured.
  - `declined`: Transaction rejected by issuing bank, gateway antifraud, or insufficient funds.
  - `voided`: Transaction cancelled/reversed via card void.
  - `error`: Technical gateway or communication failure.
  - `expired`: Attempt reservation window expired without payment initiation.
- **Minor currency units:** Single currency `COP`. Wompi's `amount_in_cents` corresponds exactly to the application's internal `bigint` minor units (e.g. COP 45,000 = `4500000`).

**Secrets and configuration**
- Provided via environment variables: `WOMPI_PUBLIC_KEY`, `WOMPI_PRIVATE_KEY`, `WOMPI_INTEGRITY_SECRET`, `WOMPI_EVENTS_SECRET`, `WOMPI_ENVIRONMENT` (`sandbox` or `production`).
- Infrastructure secret management tooling remains pending.

**Late-payment flow and stock reconciliation**
To eliminate the classic e-commerce race condition where money is captured after inventory reservations expire, the system enforces a multi-tier defense:
1. **Prevention via `expiration-time`:** The checkout payload passes `expiration-time` equal to the order's `reservation_expires_at`, preventing new payment sessions once the reservation window has elapsed.
2. **Grace period extension:**
   - When the order reservation expiry worker runs (at `placed_at + 30 minutes`), before cancelling or releasing stock, `orders` queries `payments` to check if a payment attempt is currently in flight (status `pending` at Wompi).
   - If an attempt is in flight (e.g., customer is inside PSE authentication), `orders` extends `reservation_expires_at` in steps (e.g. 15 minutes), up to a hard ceiling of **2 hours from `placed_at`**.
   - If the payment declines or fails, or the hard 2-hour maximum elapses without approval, `orders` transitions to `expired` and releases inventory to `catalog`.
3. **Post-expiry approval handling:**
   - If a payment approval webhook arrives for an order that is already in `expired` status:
     - `orders` calls `catalog` to attempt re-allocating stock for all line items.
     - **Re-allocation succeeds:** Order transitions `expired → paid`, writes an audit note to `order_status_history`, publishes `orders.order_paid`, and fulfillment proceeds normally.
     - **Re-allocation fails (insufficient stock):** Order transitions `expired → cancelled`, writes an audit note, and emits an event requiring a full refund (`refund_required`).
4. **Refund workflow:**
   - `payments` creates a `refunds` record linked to the payment attempt.
   - **Card void:** If the original payment was `CARD` and falls within Wompi's void window (same-day before daily settlement cut-off), `payments` attempts an automated void via `POST /v1/transactions/{id}/void`.
   - **Manual refund:** If the payment was non-card (`PSE`, `NEQUI`, `BANCOLOMBIA_TRANSFER`) or the void window closed, the refund is marked `manual` with status `pending`.
   - The `/admin` dashboard displays pending manual refunds. The store administrator executes a direct bank transfer to the customer, enters the transfer reference or voucher number into `external_reference`, and marks the refund `completed`.
   - `notifications` sends an automated email to the customer explaining the stock exhaustion and providing void or refund confirmation.
   - Post-payment order cancellations follow this exact same refund path.

## 3. Approved Data Model (schema `payments`)

Common columns, omitted from the tables below unless noted:
- `id uuid PRIMARY KEY` (UUIDv7) on every table.
- `created_at timestamptz NOT NULL DEFAULT now()` and `updated_at timestamptz NOT NULL DEFAULT now()` on mutable tables.
- `version integer NOT NULL DEFAULT 1` on admin-edited tables (marked ✎) for optimistic locking.
- Documented deviations from standard conventions:
  - `settlement_items`: Immutable join snapshot; has `created_at` only, no `updated_at`.
  - `provider_webhook_events`: Append-only deduplication log; has `received_at` only.

```text
payment_attempts ──< refunds ✎
       │
       └── settlement_items ──> settlements ✎

provider_webhook_events (deduplication ledger)

processed_events (outbox consumer deduplication)
```

### 3.1 `payment_attempts`

Tracks every payment transaction initiated for an order. Multiple attempts can exist for an order (e.g. buyer retries after a bank decline), but at most one attempt can reach `approved`. A new attempt cannot start while the order has an attempt in `pending` status. If a second provider approval still arrives for an order that already has an approved attempt, the second attempt is recorded as approved at the provider but does not move the order; a `manual` refund with reason `duplicate_payment` and status `pending` is created and an ERROR-level log is written.

| Column | Type | Rules |
|---|---|---|
| `order_id` | `uuid` | Not null; plain `orders.orders(id)` identifier (no cross-schema FK); indexed |
| `provider` | `text` | Not null, default `'wompi'` |
| `reference` | `text` | Not null; `UNIQUE`; random alphanumeric reference per attempt (e.g. `REF-ORD-7K2M9Q4X-1`) |
| `provider_transaction_id` | `text` | Nullable; `UNIQUE`; transaction ID assigned by Wompi |
| `payment_method_type` | `text` | Nullable; `CHECK (payment_method_type IN ('CARD','PSE','NEQUI','BANCOLOMBIA_TRANSFER'))` |
| `amount` | `bigint` | Not null; `CHECK (amount > 0)` |
| `currency` | `text` | Not null, default `'COP'`; `CHECK (currency ~ '^[A-Z]{3}$')` |
| `status` | `text` | Not null; `CHECK (status IN ('created','pending','approved','declined','voided','error','expired'))` |
| `status_message` | `text` | Nullable; provider error or decline message |
| `expires_at` | `timestamptz` | Not null; timestamp when this attempt's checkout window expires |
| `finalized_at` | `timestamptz` | Nullable; timestamp when terminal status was reached |

Partial unique indexes:
- `UNIQUE (order_id) WHERE status = 'approved'`: enforces at most one approved payment per order.

Indexes:
- Partial index: `(expires_at) WHERE status IN ('created','pending')` for checking in-flight status during expiry reconciliation.
- Index: `(order_id)` for retrieving payment history by order.

### 3.2 `refunds` ✎

Ledger of payment reversals and manual refunds. Managed by backend workflows and admin staff.

| Column | Type | Rules |
|---|---|---|
| `payment_attempt_id` | `uuid` | FK → `payment_attempts(id)` ON DELETE RESTRICT; indexed |
| `order_id` | `uuid` | Not null; plain `orders.orders(id)` identifier (no cross-schema FK); indexed |
| `amount` | `bigint` | Not null; `CHECK (amount > 0)` |
| `currency` | `text` | Not null, default `'COP'`; `CHECK (currency ~ '^[A-Z]{3}$')` |
| `reason` | `text` | Not null; `CHECK (reason IN ('late_payment_no_stock','order_cancelled','customer_request','duplicate_payment'))` |
| `method` | `text` | Not null; `CHECK (method IN ('card_void','manual'))` |
| `status` | `text` | Not null; `CHECK (status IN ('pending','completed','failed'))` |
| `external_reference` | `text` | Nullable; Wompi void transaction ID or bank transfer voucher/receipt number |
| `notes` | `text` | Nullable; administrative notes |
| `actor_id` | `uuid` | Nullable; admin user ID from `identity` for manual refunds (no cross-schema FK) |
| `completed_at` | `timestamptz` | Nullable; timestamp when refund reached completed status |

Domain invariants:
- The cumulative sum of completed refunds for a `payment_attempt_id` must never exceed `payment_attempts.amount` (enforced in the Go domain layer).

### 3.3 `settlements` ✎

Reconciliation ledger for disbursements paid out by Wompi to the merchant bank account. Recorded manually in v1 from provider settlement reports per [invoicing-and-taxes.md](../architecture/invoicing-and-taxes.md) section 7.

| Column | Type | Rules |
|---|---|---|
| `provider` | `text` | Not null, default `'wompi'` |
| `payout_date` | `date` | Not null; disbursement date to merchant bank account |
| `gross_amount` | `bigint` | Not null; `CHECK (gross_amount >= 0)` |
| `provider_fee_amount` | `bigint` | Not null; `CHECK (provider_fee_amount >= 0)` |
| `fee_vat_amount` | `bigint` | Not null; `CHECK (fee_vat_amount >= 0)` |
| `withholding_income_amount` | `bigint` | Not null; `CHECK (withholding_income_amount >= 0)` |
| `withholding_vat_amount` | `bigint` | Not null; `CHECK (withholding_vat_amount >= 0)` |
| `withholding_ica_amount` | `bigint` | Not null; `CHECK (withholding_ica_amount >= 0)` |
| `net_amount` | `bigint` | Not null; `CHECK (net_amount >= 0)` |
| `currency` | `text` | Not null, default `'COP'`; `CHECK (currency ~ '^[A-Z]{3}$')` |
| `source_reference` | `text` | Not null; provider disbursement / report identifier |
| `actor_id` | `uuid` | Not null; admin user ID from `identity` who entered the settlement (no cross-schema FK) |

Table constraints:
- `CHECK (net_amount = gross_amount - provider_fee_amount - fee_vat_amount - withholding_income_amount - withholding_vat_amount - withholding_ica_amount)`

Indexes:
- Index: `(payout_date DESC)` for financial reporting and admin list views.

### 3.4 `settlement_items`

Associates specific payment attempts with a disbursement settlement. Immutable snapshot. No `updated_at`.

| Column | Type | Rules |
|---|---|---|
| `settlement_id` | `uuid` | FK → `settlements(id)` ON DELETE CASCADE; indexed |
| `payment_attempt_id` | `uuid` | FK → `payment_attempts(id)` ON DELETE RESTRICT; `UNIQUE` (a transaction is settled once) |
| `gross_amount` | `bigint` | Not null; `CHECK (gross_amount > 0)` |
| `created_at` | `timestamptz` | Not null, default `now()` |

### 3.5 `provider_webhook_events`

Idempotency ledger for incoming provider webhooks. Follows [data-modeling.md](../architecture/data-modeling.md) section 11. No `updated_at`.

| Column | Type | Rules |
|---|---|---|
| `provider` | `text` | Not null, default `'wompi'` |
| `dedup_key` | `text` | Not null; provider event checksum (`X-Event-Checksum`) |
| `event_type` | `text` | Not null; e.g. `'transaction.updated'` |
| `received_at` | `timestamptz` | Not null, default `now()` |

Table constraints:
- `UNIQUE (provider, dedup_key)`

Retention:
- Rows are purged after 30 days by a scheduled cleanup job.

### 3.6 Domain Events (schema `payments.outbox`)

Outbox table and consumer tracking follow [data-modeling.md](../architecture/data-modeling.md) section 11.

- **`payments.payment_approved`**: Emitted when a payment attempt reaches `approved` status.
  - Attributes: `payment_attempt_id`, `order_id`, `amount`, `currency`, `provider_transaction_id`, `payment_method_type`, `approved_at`.
  - Consumers: `orders` (transitions order from `pending_payment` or `expired` to `paid`).
- **`payments.payment_failed`**: Emitted when a payment attempt transitions to `declined`, `error`, or `expired`.
  - Attributes: `payment_attempt_id`, `order_id`, `status`, `status_message`, `failed_at`.
- **`payments.refund_completed`**: Emitted when an automated card void or manual refund is finalized.
  - Attributes: `refund_id`, `order_id`, `payment_attempt_id`, `amount`, `method`, `completed_at`.
  - Consumers: `notifications` (sends refund receipt email to buyer).

**Consumed Events:**
- Checkout payment initialization is a synchronous RPC/in-process invocation from `orders` during checkout session creation, inserting a `payment_attempts` record and generating the integrity signature.
- `orders.order_cancelled`: If an order is cancelled after payment, `payments` consumes this event to initialize a refund record (`reason = 'order_cancelled'`).

## 4. Open Items

- **Secret management tooling:** Production API keys and signing secrets are injected via environment variables from an env file with `0600` permissions on the VPS outside the repository, loaded by Docker Compose and validated at application startup. Dedicated secret engines (Vault/Doppler) deferred post-v1.
- **Automated settlement import:** Automated ingestion of Wompi settlement reports via API or CSV file upload deferred to post-v1.
- **In-flight transaction query by reference (sandbox confirmation pending):** Official docs (https://docs.wompi.co/docs/colombia/transacciones/) document only `GET /v1/transactions/{transaction_id}` with the private key. On 2026-10-16, `GET /v1/transactions?reference=…` answered `401 INVALID_ACCESS_TOKEN` without a key and "Solicitud no autorizada" with a public key on both `sandbox.wompi.co` and `production.wompi.co`, while an unknown route answers a gateway `404`; the route exists, requires the private key, and its response shape is undocumented. It is used only as an adapter fallback when no transaction id is known, and must be confirmed with sandbox keys before production.

## 5. Sources

- Wompi Colombia — Planes y Tarifas: https://wompi.co/es/co/planes-tarifas/
- Wompi Colombia — Widget y Web Checkout: https://docs.wompi.co/docs/colombia/widget-checkout-web/
- Wompi Colombia — Eventos y Webhooks (firma y checksum): https://docs.wompi.co/docs/colombia/eventos/
- Wompi Colombia — Anulación de transacciones con tarjeta (Void): https://docs.wompi.co/docs/colombia/anulaciones/
- Estatuto Tributario de Colombia, arts. 401-4, 437-2, 911 (retenciones en la fuente): http://secretariasenado.gov.co/senado/basedoc/estatuto_tributario.html
