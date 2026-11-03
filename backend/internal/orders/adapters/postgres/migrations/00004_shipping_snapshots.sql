-- +goose Up
-- Historical orders remain null: live rates cannot reconstruct purchase history.
ALTER TABLE orders.orders
    ADD COLUMN shipping_zone_name text,
    ADD COLUMN shipping_min_weight_grams integer CHECK (shipping_min_weight_grams >= 0),
    ADD COLUMN shipping_max_weight_grams integer CHECK (shipping_max_weight_grams > 0),
    ADD CONSTRAINT orders_shipping_band_check CHECK (
        shipping_max_weight_grams IS NULL OR
        (shipping_min_weight_grams IS NOT NULL AND shipping_max_weight_grams > shipping_min_weight_grams)
    );

-- +goose Down
ALTER TABLE orders.orders
    DROP CONSTRAINT orders_shipping_band_check,
    DROP COLUMN shipping_zone_name,
    DROP COLUMN shipping_min_weight_grams,
    DROP COLUMN shipping_max_weight_grams;
