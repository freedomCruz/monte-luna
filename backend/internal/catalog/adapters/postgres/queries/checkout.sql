-- name: ReadCheckoutVariants :many
SELECT v.id, v.product_id, p.product_type_id, p.slug, p.title,
       p.status AS product_status, v.status, v.sku, v.options,
       v.price_amount, v.currency, v.weight_grams, v.tax_category,
       COALESCE((SELECT sum(s.quantity)::bigint FROM catalog.variant_lot_stock s
                 JOIN catalog.lots l ON l.id=s.lot_id
                 WHERE s.variant_id=v.id AND l.status='active'),0)::bigint AS available_stock
FROM catalog.product_variants v JOIN catalog.products p ON p.id=v.product_id
WHERE v.id = ANY(sqlc.arg(variant_ids)::uuid[])
ORDER BY v.id;
