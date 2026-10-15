-- name: FindZone :one
SELECT z.id FROM shipping.shipping_zones z
JOIN shipping.shipping_zone_areas a ON a.zone_id = z.id
WHERE z.status = 'active'
  AND (a.municipality_code = sqlc.arg(municipality_code)::text
       OR (a.municipality_code IS NULL AND a.department_code = left(sqlc.arg(municipality_code)::text, 2)))
ORDER BY (a.municipality_code IS NOT NULL) DESC
LIMIT 1;

-- name: ListRates :many
SELECT * FROM shipping.shipping_rates WHERE zone_id = $1 ORDER BY min_weight_grams, id;

-- name: InsertArea :exec
INSERT INTO shipping.shipping_zone_areas (zone_id, department_code, municipality_code)
VALUES ($1, $2, $3);

-- name: InsertRate :one
INSERT INTO shipping.shipping_rates
(zone_id, name, price_amount, currency, min_weight_grams, max_weight_grams,
 free_shipping_threshold_amount, estimated_days_min, estimated_days_max, status)
VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
RETURNING id;
