-- +goose Up
-- Deliberately no backfill: invalid existing estimates must be corrected by
-- the merchant before applying this migration. PostgreSQL rejects NULL or
-- out-of-range rows, and goose rolls the entire migration back atomically.
ALTER TABLE shipping.shipping_rates
    DROP CONSTRAINT shipping_rates_estimated_days_min_check,
    DROP CONSTRAINT shipping_rates_estimated_days_max_check,
    -- 00001's first multi-column check (shipping_rates_check) is the weight
    -- band rule; its second (shipping_rates_check1) is the old days ordering.
    DROP CONSTRAINT shipping_rates_check1,
    ALTER COLUMN estimated_days_min SET NOT NULL,
    ALTER COLUMN estimated_days_max SET NOT NULL,
    ADD CONSTRAINT shipping_rates_estimated_days_min_check CHECK (estimated_days_min >= 1),
    ADD CONSTRAINT shipping_rates_estimated_days_max_check CHECK (estimated_days_max >= estimated_days_min);

-- +goose Down
ALTER TABLE shipping.shipping_rates
    DROP CONSTRAINT shipping_rates_estimated_days_min_check,
    DROP CONSTRAINT shipping_rates_estimated_days_max_check,
    ALTER COLUMN estimated_days_min DROP NOT NULL,
    ALTER COLUMN estimated_days_max DROP NOT NULL,
    ADD CONSTRAINT shipping_rates_estimated_days_min_check CHECK (estimated_days_min IS NULL OR estimated_days_min >= 0),
    ADD CONSTRAINT shipping_rates_estimated_days_max_check CHECK (estimated_days_max IS NULL OR estimated_days_max >= 0),
    ADD CONSTRAINT shipping_rates_check1 CHECK (estimated_days_max IS NULL OR estimated_days_min IS NULL OR estimated_days_max >= estimated_days_min);
