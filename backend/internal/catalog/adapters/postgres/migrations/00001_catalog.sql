-- +goose Up
-- The runner creates catalog before goose creates catalog.goose_db_version.
CREATE TABLE catalog.brands (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  description text,
  logo_storage_key text,
  website_url text,
  status text NOT NULL CHECK (status IN ('active', 'archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1
);

CREATE TABLE catalog.origins (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  producer_name text NOT NULL,
  country_code text NOT NULL CHECK (country_code ~ '^[A-Z]{2}$'),
  department text,
  municipality_code text CHECK (municipality_code ~ '^[0-9]{5}$'),
  municipality_name text,
  altitude_min_masl integer CHECK (altitude_min_masl > 0),
  altitude_max_masl integer CHECK (altitude_max_masl > 0),
  story text,
  status text NOT NULL CHECK (status IN ('active', 'archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1,
  CHECK (altitude_max_masl >= altitude_min_masl)
);

CREATE TABLE catalog.origin_images (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  origin_id uuid NOT NULL REFERENCES catalog.origins (id),
  storage_key text NOT NULL,
  alt_text text NOT NULL,
  position integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1
);
CREATE INDEX origin_images_origin_id_idx ON catalog.origin_images (origin_id);

CREATE TABLE catalog.product_types (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1
);

CREATE TABLE catalog.attribute_definitions (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  product_type_id uuid NOT NULL REFERENCES catalog.product_types (id),
  key text NOT NULL CHECK (key ~ '^[a-z][a-z0-9_]*$'),
  label text NOT NULL,
  data_type text NOT NULL CHECK (data_type IN ('text', 'integer', 'decimal', 'boolean', 'option', 'multi_option')),
  scope text NOT NULL CHECK (scope IN ('product', 'variant')),
  is_variant_option boolean NOT NULL,
  is_required boolean NOT NULL,
  is_filterable boolean NOT NULL,
  allowed_values jsonb,
  unit text,
  position integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1,
  UNIQUE (product_type_id, key),
  CHECK (NOT is_variant_option OR scope = 'variant'),
  CHECK (data_type NOT IN ('option', 'multi_option') OR (allowed_values IS NOT NULL AND jsonb_typeof(allowed_values) = 'array'))
);
-- UNIQUE(product_type_id, key) also indexes the product_type_id foreign key.

CREATE TABLE catalog.products (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  product_type_id uuid NOT NULL REFERENCES catalog.product_types (id),
  brand_id uuid REFERENCES catalog.brands (id),
  origin_id uuid REFERENCES catalog.origins (id),
  title text NOT NULL,
  slug text NOT NULL UNIQUE,
  description text,
  status text NOT NULL CHECK (status IN ('draft', 'published', 'archived')),
  attributes jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1
);
CREATE INDEX products_product_type_id_idx ON catalog.products (product_type_id);
CREATE INDEX products_brand_id_idx ON catalog.products (brand_id);
CREATE INDEX products_origin_id_idx ON catalog.products (origin_id);
CREATE INDEX products_published_created_at_idx ON catalog.products (created_at DESC) WHERE status = 'published';

CREATE TABLE catalog.product_variants (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  product_id uuid NOT NULL REFERENCES catalog.products (id),
  sku text NOT NULL UNIQUE,
  barcode text,
  options jsonb NOT NULL,
  attributes jsonb NOT NULL DEFAULT '{}',
  price_amount bigint NOT NULL CHECK (price_amount > 0),
  compare_at_price_amount bigint CHECK (compare_at_price_amount IS NULL OR compare_at_price_amount > price_amount),
  currency text NOT NULL DEFAULT 'COP' CHECK (currency ~ '^[A-Z]{3}$'),
  weight_grams integer NOT NULL CHECK (weight_grams > 0),
  length_mm integer CHECK (length_mm > 0),
  width_mm integer CHECK (width_mm > 0),
  height_mm integer CHECK (height_mm > 0),
  tax_category text NOT NULL CHECK (tax_category IN ('excluded', 'exempt', 'reduced', 'standard')),
  status text NOT NULL CHECK (status IN ('active', 'archived')),
  position integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1,
  UNIQUE (product_id, options),
  UNIQUE (id, product_id)
);
-- UNIQUE(product_id, options) also indexes the product_id foreign key.

CREATE TABLE catalog.product_images (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  product_id uuid NOT NULL REFERENCES catalog.products (id),
  variant_id uuid,
  storage_key text NOT NULL,
  alt_text text NOT NULL,
  position integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1,
  FOREIGN KEY (variant_id, product_id) REFERENCES catalog.product_variants (id, product_id)
);
CREATE INDEX product_images_product_id_idx ON catalog.product_images (product_id);
CREATE INDEX product_images_variant_product_idx ON catalog.product_images (variant_id, product_id);

CREATE TABLE catalog.lots (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  product_id uuid NOT NULL REFERENCES catalog.products (id),
  lot_code text NOT NULL,
  production_date date NOT NULL,
  expiration_date date CHECK (expiration_date >= production_date),
  attributes jsonb NOT NULL DEFAULT '{}',
  status text NOT NULL CHECK (status IN ('active', 'depleted', 'archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1,
  UNIQUE (product_id, lot_code),
  UNIQUE (id, product_id)
);
-- UNIQUE(product_id, lot_code) also indexes the product_id foreign key.

CREATE TABLE catalog.categories (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  parent_id uuid REFERENCES catalog.categories (id),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  position integer NOT NULL,
  status text NOT NULL CHECK (status IN ('active', 'archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1
);
CREATE INDEX categories_parent_id_idx ON catalog.categories (parent_id);

CREATE TABLE catalog.product_categories (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  product_id uuid NOT NULL REFERENCES catalog.products (id),
  category_id uuid NOT NULL REFERENCES catalog.categories (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id, category_id)
);
CREATE INDEX product_categories_category_id_idx ON catalog.product_categories (category_id);

CREATE TABLE catalog.variant_lot_stock (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  product_id uuid NOT NULL,
  variant_id uuid NOT NULL,
  lot_id uuid NOT NULL,
  quantity integer NOT NULL CHECK (quantity >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (variant_id, lot_id),
  FOREIGN KEY (variant_id, product_id) REFERENCES catalog.product_variants (id, product_id),
  FOREIGN KEY (lot_id, product_id) REFERENCES catalog.lots (id, product_id)
);
CREATE INDEX variant_lot_stock_variant_product_idx ON catalog.variant_lot_stock (variant_id, product_id);
CREATE INDEX variant_lot_stock_lot_product_idx ON catalog.variant_lot_stock (lot_id, product_id);

CREATE TABLE catalog.inventory_movements (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  variant_id uuid NOT NULL,
  lot_id uuid NOT NULL,
  quantity_delta integer NOT NULL CHECK (quantity_delta <> 0),
  reason text NOT NULL CHECK (reason IN ('receipt', 'sale', 'return', 'adjustment', 'damage', 'release')),
  reference_id uuid,
  actor_id uuid,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (variant_id, lot_id) REFERENCES catalog.variant_lot_stock (variant_id, lot_id)
);
CREATE INDEX inventory_movements_variant_lot_idx ON catalog.inventory_movements (variant_id, lot_id);
CREATE INDEX inventory_movements_lot_created_at_idx ON catalog.inventory_movements (lot_id, created_at);

-- +goose Down
-- Reverse dependency order; leave the module schema and goose version table intact.
DROP TABLE catalog.inventory_movements;
DROP TABLE catalog.variant_lot_stock;
DROP TABLE catalog.product_categories;
DROP TABLE catalog.categories;
DROP TABLE catalog.lots;
DROP TABLE catalog.product_images;
DROP TABLE catalog.product_variants;
DROP TABLE catalog.products;
DROP TABLE catalog.attribute_definitions;
DROP TABLE catalog.product_types;
DROP TABLE catalog.origin_images;
DROP TABLE catalog.origins;
DROP TABLE catalog.brands;
