# Catalog Domain

Canonical requirements and data model for the `catalog` module. Conventions in [data-modeling.md](../architecture/data-modeling.md) apply to every table below.

## 1. Status

| Item | Status |
|---|---|
| Requirements (section 2) | Approved |
| Origin as a reusable entity | Approved |
| Brand as an independent entity | Approved |
| Lot inventory: stock per variant and lot, oldest lot first | Approved |
| Single central warehouse | Approved |
| Store currency: single currency configurable per store (COP default) | Approved |
| Promotional reference price (`compare_at_price_amount`) | Approved |
| Barcode on variants | Approved |
| Data model (section 3) | Approved |
| Price per variant | Approved |
| Media storage location: Cloudflare R2 (S3-compatible object storage, $0 egress, standard SDK via `MediaStorePort`) | Approved |
| Stock reservation strategy between `orders` and `catalog` | Approved |
| Complex promotional rules and coupons | Out of scope here; owned by `promotions` |
| Food health and sanitary regulations (INVIMA) | Out of scope; not managed by ecommerce platform |

## 2. Approved Requirements

**Scope**
- The first version sells physical products only.
- Merchants define product types, their attributes, and their variant options, so any physical product can be sold without schema changes. Coffee and cacao are the first configured types, not hard-coded ones.

**Origin and traceability**
- An origin (farm or producer unit) is its own entity: name, producer or owner, region (country, department, municipality with DANE code), altitude in meters above sea level, short history, and photos. Several products reference the same origin.
- Stock is counted per variant and lot. Sales take the oldest lot first, and each sale records its lots, so every sold unit is traceable.
- The storefront shows the roast date of the lot the next buyer will receive: the oldest lot with available stock for that variant.
- The `orders` module snapshots the allocated lots on each order line (lot id, lot code, production date, quantity), because modules cannot read each other's tables.

**Brands**
- A commercial brand or manufacturer (`brands`) is its own entity: name, slug, description, logo, and website.
- Products can reference a commercial brand (`brand_id`) independently of whether they have an agricultural origin (`origin_id`).

**Pricing, currency, and stock scope**
- The store operates with a single configured base currency per store installation (COP default in minor integer units).
- Price is defined per variant (`price_amount` in minor units `bigint`).
- Variants support an optional promotional reference price (`compare_at_price_amount` in `bigint`), allowing storefronts to display crossed-out/original prices (e.g., "Before $45,000, Now $38,000").
- Variants support an optional standard barcode (`barcode`, such as EAN-13 or UPC).
- Initial versions operate with a single central warehouse; inventory tracking is consolidated under `variant_lot_stock`.

**Coffee attributes**
- Species and variety are separate fields. Arabica is the species; Típica, Borbón, Caturra, Colombia, Castillo, Tabi, and Maragogipe are Arabica varieties (Cenicafé). A product may list several varieties (blends).
- Process (for example washed, honey with its subtypes, natural, special fermentations), tasting notes, and an optional cupping score stored with the assessment protocol used.
- **Roast level is fixed per product by the producer**; it is a product attribute, not a variant option.

**Cacao attributes**
- Genetic group or clone (for example Criollo, Trinitario, Forastero), fermentation and drying, product form (beans, nibs, paste, table chocolate, bar), and cacao percentage (0–100) where applicable.
- "Fine or flavour" is declared by the merchant, never computed: the ICCO notes there is no single universal criterion.

**Variants and stock**
- Presentation weight (for example 250 g and 500 g) is a variant option and is stored in the typed weight column.
- **Grind is a variant option with its own stock** (whole bean, fine, medium, coarse), because ground bags are packed in advance.
- When a variant has no available stock, the storefront shows an out-of-stock badge and disables add-to-cart; the backend rejects the purchase regardless.

## 3. Approved Data Model (schema `catalog`)

Interactive ERD diagram in Eraser: [Ecommerce — Data Model & ERD (Catalog)](https://app.eraser.io/workspace/11T3dyhOIILEDaQwpdTJ?diagram=6fiJ3pRDQbKP1DVblDbk&layout=canvas)

Common columns, omitted from the tables below unless noted:
- `id uuid PRIMARY KEY` (UUIDv7) on every table.
- `created_at timestamptz NOT NULL DEFAULT now()` and `updated_at timestamptz NOT NULL DEFAULT now()` on mutable tables.
- `version integer NOT NULL DEFAULT 1` on tables edited from the admin panel (marked ✎).

```text
brands ──< products
             │
origins ──< origin_images
   │         │
   └──< products >── product_types ──< attribute_definitions
          │   │
          │   ├──< product_categories >── categories (tree)
          │   ├──< product_images
          │   ├──< lots
          │   └──< product_variants
          │              │
          └── variant_lot_stock (variant × lot) ──< inventory_movements
```

### 3.1 `brands` ✎

| Column | Type | Rules |
|---|---|---|
| `name` | `text` | Not null |
| `slug` | `text` | `UNIQUE` |
| `description` | `text` | Nullable |
| `logo_storage_key` | `text` | Nullable |
| `website_url` | `text` | Nullable |
| `status` | `text` | `CHECK (status IN ('active','archived'))` |

### 3.2 `origins` ✎

| Column | Type | Rules |
|---|---|---|
| `name` | `text` | Not null; farm or producer unit name |
| `slug` | `text` | `UNIQUE`; public route of the origin page |
| `producer_name` | `text` | Not null; owner or producer |
| `country_code` | `text` | Not null; `CHECK (country_code ~ '^[A-Z]{2}$')` |
| `department` | `text` | Nullable |
| `municipality_code` | `text` | Nullable; DANE code, `CHECK (municipality_code ~ '^[0-9]{5}$')` |
| `municipality_name` | `text` | Nullable |
| `altitude_min_masl`, `altitude_max_masl` | `integer` | Nullable; `> 0`; max ≥ min |
| `story` | `text` | Nullable; short history |
| `status` | `text` | `CHECK (status IN ('active','archived'))` |

### 3.3 `origin_images` and `product_images`

Both tables are ✎ (reordered and edited from the admin panel).

- `origin_images`: `origin_id` (FK, indexed), `storage_key text NOT NULL`, `alt_text text NOT NULL`, `position integer`.
- `product_images`: `product_id` (FK, indexed), optional `variant_id` with FK `(variant_id, product_id)` → `product_variants (id, product_id)` and an index on `(variant_id, product_id)`, `storage_key text NOT NULL`, `alt_text text NOT NULL`, `position integer`.
- `storage_key` identifies the object in the Cloudflare R2 bucket (S3-compatible object storage). URLs are resolved through a `MediaStorePort` in Go and served via CDN with zero egress fees. Relative keys only are stored in the database.

### 3.4 `product_types` ✎

`name text`, `slug text UNIQUE`. Examples: Coffee, Cacao.

### 3.5 `attribute_definitions` ✎

| Column | Type | Rules |
|---|---|---|
| `product_type_id` | `uuid` | FK, indexed |
| `key` | `text` | `snake_case`; `UNIQUE (product_type_id, key)` |
| `label` | `text` | Shown to buyers |
| `data_type` | `text` | `CHECK IN ('text','integer','decimal','boolean','option','multi_option')` |
| `scope` | `text` | `CHECK IN ('product','variant')` |
| `is_variant_option` | `boolean` | Only with `scope = 'variant'`; defines a variant axis (presentation, grind) |
| `is_required`, `is_filterable` | `boolean` | Filterable attributes get GIN indexing when a storefront filter uses them |
| `allowed_values` | `jsonb` | Ordered array; required for `option` and `multi_option` |
| `unit` | `text` | Nullable (for example `%`, `masl`) |
| `position` | `integer` | Display order |

Table constraints:
- `CHECK (NOT is_variant_option OR scope = 'variant')`
- `CHECK (data_type NOT IN ('option','multi_option') OR (allowed_values IS NOT NULL AND jsonb_typeof(allowed_values) = 'array'))`

Example for Coffee: `species` (option), `varieties` (multi_option), `process` (option), `roast_level` (option, product scope), `tasting_notes` (text), `cupping_score` (decimal), `cupping_protocol` (option), `presentation` (option, variant option), `grind` (option, variant option).

### 3.6 `products` ✎

| Column | Type | Rules |
|---|---|---|
| `product_type_id` | `uuid` | FK, indexed |
| `brand_id` | `uuid` | FK, indexed; nullable |
| `origin_id` | `uuid` | FK, indexed; nullable |
| `title` | `text` | Not null |
| `slug` | `text` | `UNIQUE` |
| `description` | `text` | Nullable |
| `status` | `text` | `CHECK IN ('draft','published','archived')` |
| `attributes` | `jsonb` | Not null, default `{}`; product-scope values validated in Go against `attribute_definitions` |

Partial index for the public catalog: `(created_at DESC) WHERE status = 'published'`.

### 3.7 `product_variants` ✎

| Column | Type | Rules |
|---|---|---|
| `product_id` | `uuid` | FK, indexed |
| `sku` | `text` | `UNIQUE` |
| `barcode` | `text` | Nullable; standard barcode (e.g. EAN-13, UPC) |
| `options` | `jsonb` | Not null; variant-option values (for example `{"presentation":"250 g","grind":"whole_bean"}`); `UNIQUE (product_id, options)` |
| `attributes` | `jsonb` | Not null, default `{}`; other variant-scope values |
| `price_amount` | `bigint` | Not null; `> 0`; store currency minor units |
| `compare_at_price_amount` | `bigint` | Nullable; `CHECK (compare_at_price_amount IS NULL OR compare_at_price_amount > price_amount)` |
| `currency` | `text` | Not null, default `'COP'`; `CHECK (currency ~ '^[A-Z]{3}$')` |
| `weight_grams` | `integer` | Not null; `> 0` |
| `length_mm`, `width_mm`, `height_mm` | `integer` | Nullable; `> 0` |
| `tax_category` | `text` | Not null, no default; `CHECK IN ('excluded','exempt','reduced','standard')` |
| `status` | `text` | `CHECK IN ('active','archived')` |
| `position` | `integer` | Display order |

`UNIQUE (id, product_id)` supports the composite foreign keys in 3.10.

### 3.8 `lots` ✎

| Column | Type | Rules |
|---|---|---|
| `product_id` | `uuid` | FK, indexed |
| `lot_code` | `text` | `UNIQUE (product_id, lot_code)` |
| `production_date` | `date` | Not null; for coffee, the roast date |
| `expiration_date` | `date` | Nullable; ≥ `production_date` |
| `attributes` | `jsonb` | Not null, default `{}`; lot-specific data (for example harvest period, lot cupping score) |
| `status` | `text` | `CHECK IN ('active','depleted','archived')` |

`UNIQUE (id, product_id)` supports the composite foreign keys in 3.10.

### 3.9 `categories` ✎ and `product_categories`

- `categories`: `parent_id` (self FK, indexed, nullable), `name`, `slug UNIQUE`, `position`, `status CHECK IN ('active','archived')`.
- `product_categories`: `id uuid PRIMARY KEY` like every table, `product_id` and `category_id` (both FK), `UNIQUE (product_id, category_id)` (serves lookups by product), and an index on `category_id` (serves category pages).

### 3.10 `variant_lot_stock`

| Column | Type | Rules |
|---|---|---|
| `product_id` | `uuid` | Not null |
| `variant_id` | `uuid` | FK `(variant_id, product_id)` → `product_variants (id, product_id)` |
| `lot_id` | `uuid` | FK `(lot_id, product_id)` → `lots (id, product_id)` |
| `quantity` | `integer` | Not null; `CHECK (quantity >= 0)` |

`UNIQUE (variant_id, lot_id)` also serves lookups by variant. An index on `(lot_id, product_id)` covers the lot foreign key. The composite foreign keys guarantee a variant is only stocked from lots of its own product. Allocation locks the variant's rows ordered by the lot's `production_date` and decrements with `WHERE quantity >= $n`.

### 3.11 `inventory_movements` (append-only)

| Column | Type | Rules |
|---|---|---|
| `variant_id`, `lot_id` | `uuid` | Composite FK `(variant_id, lot_id)` → `variant_lot_stock (variant_id, lot_id)`; indexed on `(variant_id, lot_id)` |
| `quantity_delta` | `integer` | Not null; `<> 0` |
| `reason` | `text` | `CHECK IN ('receipt','sale','return','adjustment','damage','release')` |
| `reference_id` | `uuid` | Nullable; another module's identifier (for example an order), plain `uuid` with no FK |
| `actor_id` | `uuid` | Nullable; admin user from `identity`, plain `uuid` with no FK |
| `note` | `text` | Nullable |

Inserted in the same transaction as every change to `variant_lot_stock`. An index on `(lot_id, created_at)` serves lot traceability queries (which movements and orders used a lot). The `release` reason returns allocated stock from an expired or cancelled unpaid order reservation.

### 3.12 Contract with `orders`

- The catalog's public API allocates stock for a variant and quantity and returns the allocations: lot id, lot code, production date, and quantity per lot.
- Allocation happens when the order is placed and is held for 30 minutes referencing the order ID. Expired or cancelled unpaid orders release their allocations by reference (inventory movement reason `release`).
- If order persistence fails after allocation, a compensating release is called immediately, and a periodic job reconciles any discrepancies.
- `orders` stores those allocations in its own order-line snapshot. The catalog ledger references the order only through `inventory_movements.reference_id`.

### 3.13 Module infrastructure

`catalog.outbox` and `catalog.processed_events` follow [data-modeling.md](../architecture/data-modeling.md) section 11 and are created when the first catalog event or consumer exists.

## 4. Open Items

None. All v1 catalog requirements, data models, media storage, inventory rules, and architectural boundaries are fully resolved and approved. Sanitary regulation tracking (INVIMA) is explicitly excluded from ecommerce scope.

## 5. Sources

- Cenicafé, Colombian coffee varieties: https://www.cenicafe.org/es/publications/sistemas_de_produccion.pdf
- ICO, compilation of specialty coffee definitions: https://ico.org/documents/cy2024-25/fgsc-3-r1e-definitions-specialty-coffee.pdf
- ICCO, fine or flavour cocoa: https://www.icco.org/fine-or-flavor-cocoa/
