# Shipping Domain

Canonical requirements and data model for the `shipping` module. Conventions in [data-modeling.md](../architecture/data-modeling.md) apply to every table below.

## 1. Status

| Item | Status |
|---|---|
| Dedicated module (`internal/shipping`, schema `shipping`) | Approved |
| Shipping quote resolution API for orders | Approved |
| Zone resolution hierarchy (municipality over department) | Approved |
| Weight-band rate resolution | Approved |
| Free shipping threshold per rate | Approved |
| Manual fulfillment dispatch in v1 (carrier, tracking number, tracking URL) | Approved |
| Dispatch event emission (`shipping.shipment_shipped`) | Approved |
| Order paid consumer (`orders.order_paid` creates pending shipment) | Approved |
| Data model (section 3) | Approved |
| Carrier API integration (e.g. Servientrega, Coordinadora, Inter Rapidísimo) | Deferred (post-v1) |
| Split shipments (multiple packages/shipments per order) | Deferred (post-v1) |

## 2. Approved Requirements

**Module responsibility and scope**
- Resides in `internal/shipping` with isolated PostgreSQL schema `shipping`.
- Owns geographical shipping zones, coverage definitions (DANE departments and municipalities), weight-band shipping rates, and physical shipment fulfillment.
- In v1, fulfills orders through a single central warehouse with manual admin dispatch.

**Shipping Quote API**
- Consumed by `internal/orders` during server-side checkout quote calculation.
- **Inputs:**
  - `municipality_code`: 5-digit DANE code (e.g. `11001` for Bogotá, D.C.).
  - `total_weight_grams`: Total weight of all items in grams (`integer > 0`).
  - `order_subtotal`: Order merchandise subtotal in minor currency units (`bigint >= 0`).
- **Resolution algorithm:**
  1. **Zone matching:**
     - First, look for an active zone covering the specific 5-digit `municipality_code` in `shipping_zone_areas`.
     - If no specific municipality match exists, fall back to an active zone covering the 2-digit department code (`left(municipality_code, 2)`) where `municipality_code IS NULL`.
     - A specific municipality match always wins over a whole-department definition.
  2. **Rate matching:**
     - Within the resolved active zone, find the active `shipping_rates` record whose weight band contains `total_weight_grams` (`min_weight_grams <= total_weight_grams` AND (`max_weight_grams IS NULL OR total_weight_grams <= max_weight_grams`)).
     - Overlapping weight bands within the same zone are forbidden and validated in the Go domain layer upon rate creation/update.
  3. **Pricing calculation:**
     - If `free_shipping_threshold_amount IS NOT NULL` and `order_subtotal >= free_shipping_threshold_amount`, the resolved shipping cost is `0`.
     - Otherwise, the resolved shipping cost is `price_amount`.
  4. **Unserviceable destinations:**
     - If no matching active zone or rate covers the requested municipality and package weight, shipping is unavailable. Checkout cannot proceed, and the buyer receives a clear explanation.

**Fulfillment workflow in v1 (Manual dispatch)**
- When an order is paid, `shipping` consumes `orders.order_paid` and creates a shipment record in `shipments` with `status = 'pending'`.
- In v1, dispatch is performed manually by store administrators via the `/admin` dashboard:
  - Admin enters `carrier_name` (e.g. Servientrega, Coordinadora, Inter Rapidísimo, Envía), `tracking_number`, and optional `tracking_url`.
  - Marking the package as dispatched transitions status to `'shipped'`, records `shipped_at = now()`, and publishes `shipping.shipment_shipped` to `shipping.outbox`.
  - `orders` consumes `shipping.shipment_shipped` and updates the order status to `'shipped'`.
  - `notifications` consumes `shipping.shipment_shipped` (or `orders.order_shipped`) and sends the dispatch email with tracking details to the buyer.
  - Delivery is confirmed manually by admin updating status to `'delivered'` with `delivered_at = now()`.

**Future carrier API integration**
- Direct integration with logistics carriers (automated rate queries, shipping guide generation, label printing, webhook tracking updates) will be implemented as modular adapters inside `internal/shipping` implementing a dedicated `CarrierPort` interface, without breaking existing contracts.

## 3. Approved Data Model (schema `shipping`)

Common columns, omitted from the tables below unless noted:
- `id uuid PRIMARY KEY` (UUIDv7) on every table.
- `created_at timestamptz NOT NULL DEFAULT now()` and `updated_at timestamptz NOT NULL DEFAULT now()` on mutable tables.
- `version integer NOT NULL DEFAULT 1` on admin-edited tables (marked ✎) for optimistic locking.

```text
shipping_zones ✎ ──< shipping_zone_areas
       │
       └──< shipping_rates ✎

shipments ✎ (one-to-one with orders, plain order_id)
```

### 3.1 `shipping_zones` ✎

Defines logical delivery regions (e.g., "Bogotá Express", "Ciudades Principales", "Trayectos Especiales").

| Column | Type | Rules |
|---|---|---|
| `name` | `text` | Not null; `UNIQUE` |
| `status` | `text` | Not null, default `'active'`; `CHECK (status IN ('active','archived'))` |

### 3.2 `shipping_zone_areas`

Geographic mappings associated with a zone. A zone covers entire departments, specific municipalities, or a combination.

| Column | Type | Rules |
|---|---|---|
| `zone_id` | `uuid` | FK → `shipping_zones(id)` ON DELETE CASCADE; indexed |
| `department_code` | `text` | Not null; 2-digit DANE department code, `CHECK (department_code ~ '^[0-9]{2}$')` |
| `municipality_code` | `text` | Nullable; 5-digit DANE municipality code, `CHECK (municipality_code ~ '^[0-9]{5}$')` |

Table constraints:
- `CHECK (municipality_code IS NULL OR left(municipality_code, 2) = department_code)`

Partial unique indexes:
- `UNIQUE (municipality_code) WHERE municipality_code IS NOT NULL`: a specific municipality can belong to at most one shipping zone.
- `UNIQUE (department_code) WHERE municipality_code IS NULL`: a department-wide definition can belong to at most one shipping zone.

### 3.3 `shipping_rates` ✎

Weight-based price tiers within a shipping zone.

| Column | Type | Rules |
|---|---|---|
| `zone_id` | `uuid` | FK → `shipping_zones(id)` ON DELETE CASCADE; indexed |
| `name` | `text` | Not null; e.g. "Standard Parcel", "Heavy Shipment" |
| `price_amount` | `bigint` | Not null; `CHECK (price_amount >= 0)` |
| `currency` | `text` | Not null, default `'COP'`; `CHECK (currency ~ '^[A-Z]{3}$')` |
| `min_weight_grams` | `integer` | Not null, default `0`; `CHECK (min_weight_grams >= 0)` |
| `max_weight_grams` | `integer` | Nullable; open-ended upper limit when null; `CHECK (max_weight_grams IS NULL OR max_weight_grams > min_weight_grams)` |
| `free_shipping_threshold_amount` | `bigint` | Nullable; `CHECK (free_shipping_threshold_amount IS NULL OR free_shipping_threshold_amount > 0)` |
| `estimated_days_min` | `integer` | Nullable; `CHECK (estimated_days_min IS NULL OR estimated_days_min >= 0)` |
| `estimated_days_max` | `integer` | Nullable; `CHECK (estimated_days_max IS NULL OR estimated_days_max >= 0)` |
| `status` | `text` | Not null, default `'active'`; `CHECK (status IN ('active','archived'))` |

Table constraints:
- `CHECK (estimated_days_max IS NULL OR estimated_days_min IS NULL OR estimated_days_max >= estimated_days_min)`

Domain invariants:
- Overlapping weight ranges for the same zone and active status are validated and rejected in the Go domain logic.

### 3.4 `shipments` ✎

Fulfillment records for customer orders. Exactly one shipment per order in v1.

| Column | Type | Rules |
|---|---|---|
| `order_id` | `uuid` | Not null; `UNIQUE`; plain identifier from `orders` (no cross-schema FK) |
| `carrier_name` | `text` | Not null; name of the shipping company |
| `tracking_number` | `text` | Nullable |
| `tracking_url` | `text` | Nullable |
| `status` | `text` | Not null, default `'pending'`; `CHECK (status IN ('pending','shipped','delivered','returned'))` |
| `shipped_at` | `timestamptz` | Nullable |
| `delivered_at` | `timestamptz` | Nullable |
| `actor_id` | `uuid` | Nullable; admin user ID from `identity` (plain uuid, no cross-schema FK) |

Indexes:
- Index: `(status, created_at DESC)` for admin fulfillment listing.

### 3.5 Domain Events (schema `shipping.outbox`)

Outbox table and consumer tracking follow [data-modeling.md](../architecture/data-modeling.md) section 11.

- **`shipping.shipment_shipped`**: Published when an administrator marks a shipment as dispatched.
  - Attributes: `shipment_id`, `order_id`, `carrier_name`, `tracking_number`, `tracking_url`, `shipped_at`.
  - Consumers:
    - `orders`: transitions order status from `preparing` to `shipped`.
    - `notifications`: sends email notification with tracking number and link to customer.

**Consumed events (`shipping.processed_events`):**
- **`orders.order_paid`**: Consumed by `shipping` to insert a new shipment with `status = 'pending'`.

## 4. Open Items

- **Carrier API integrations:** Automated integration with Colombian courier APIs (e.g. Coordinadora, Servientrega, Envia, Inter Rapidísimo) for automatic rate discovery, waybill creation, and webhook-driven tracking updates.
- **Split shipments:** Handling multi-origin or partial fulfillment orders requiring more than one package/shipment per order.

## 5. Sources

- DANE (Divipola - División Político-Administrativa de Colombia): https://www.dane.gov.co/index.php/informacion-georreferenciada/nomenclatura-y-divipola
- MinTIC (Servicios Postales y Logística en Colombia): https://mintic.gov.co
