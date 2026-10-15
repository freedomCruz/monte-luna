-- +goose Up
CREATE TABLE shipping.shipping_zones (
    id uuid PRIMARY KEY DEFAULT uuidv7(),
    name text NOT NULL UNIQUE,
    status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
    version integer NOT NULL DEFAULT 1,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE shipping.shipping_zone_areas (
    id uuid PRIMARY KEY DEFAULT uuidv7(),
    zone_id uuid NOT NULL REFERENCES shipping.shipping_zones(id) ON DELETE CASCADE,
    department_code text NOT NULL CHECK (department_code ~ '^[0-9]{2}$'),
    municipality_code text CHECK (municipality_code ~ '^[0-9]{5}$'),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CHECK (municipality_code IS NULL OR left(municipality_code, 2) = department_code)
);
CREATE INDEX shipping_zone_areas_zone_idx ON shipping.shipping_zone_areas(zone_id);
CREATE UNIQUE INDEX shipping_zone_areas_municipality_idx ON shipping.shipping_zone_areas(municipality_code) WHERE municipality_code IS NOT NULL;
CREATE UNIQUE INDEX shipping_zone_areas_department_idx ON shipping.shipping_zone_areas(department_code) WHERE municipality_code IS NULL;

CREATE TABLE shipping.shipping_rates (
    id uuid PRIMARY KEY DEFAULT uuidv7(),
    zone_id uuid NOT NULL REFERENCES shipping.shipping_zones(id) ON DELETE CASCADE,
    name text NOT NULL,
    price_amount bigint NOT NULL CHECK (price_amount >= 0),
    currency text NOT NULL DEFAULT 'COP' CHECK (currency ~ '^[A-Z]{3}$'),
    min_weight_grams integer NOT NULL DEFAULT 0 CHECK (min_weight_grams >= 0),
    max_weight_grams integer CHECK (max_weight_grams IS NULL OR max_weight_grams > min_weight_grams),
    free_shipping_threshold_amount bigint CHECK (free_shipping_threshold_amount IS NULL OR free_shipping_threshold_amount > 0),
    estimated_days_min integer CHECK (estimated_days_min IS NULL OR estimated_days_min >= 0),
    estimated_days_max integer CHECK (estimated_days_max IS NULL OR estimated_days_max >= 0),
    status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
    version integer NOT NULL DEFAULT 1,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CHECK (estimated_days_max IS NULL OR estimated_days_min IS NULL OR estimated_days_max >= estimated_days_min)
);
CREATE INDEX shipping_rates_zone_idx ON shipping.shipping_rates(zone_id);

-- +goose Down
DROP TABLE shipping.shipping_rates;
DROP TABLE shipping.shipping_zone_areas;
DROP TABLE shipping.shipping_zones;
