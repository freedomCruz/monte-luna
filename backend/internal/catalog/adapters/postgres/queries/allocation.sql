-- name: LockAllocationReference :exec
SELECT pg_advisory_xact_lock(hashtextextended('catalog:allocation:' || sqlc.arg(reference)::text,0));

-- name: LockStockVariant :one
SELECT v.id,v.status,p.status AS product_status FROM catalog.product_variants v
JOIN catalog.products p ON p.id=v.product_id WHERE v.id=$1 FOR UPDATE OF v FOR SHARE OF p;

-- name: LockStockLots :many
SELECT s.lot_id,l.lot_code,l.production_date,s.quantity FROM catalog.variant_lot_stock s
JOIN catalog.lots l ON l.id=s.lot_id WHERE s.variant_id=$1 AND l.status='active'
ORDER BY l.production_date,l.id FOR UPDATE OF s;

-- name: DecrementStock :execrows
UPDATE catalog.variant_lot_stock SET quantity=quantity-$3,updated_at=now()
WHERE variant_id=$1 AND lot_id=$2 AND quantity >= $3;

-- name: IncrementStock :execrows
UPDATE catalog.variant_lot_stock SET quantity=quantity+$3,updated_at=now() WHERE variant_id=$1 AND lot_id=$2;

-- name: InsertStockMovement :exec
INSERT INTO catalog.inventory_movements(variant_id,lot_id,quantity_delta,reason,reference_id)
VALUES($1,$2,$3,$4,$5);

-- name: ReferenceMovements :many
SELECT variant_id,lot_id,sum(quantity_delta)::bigint AS quantity FROM catalog.inventory_movements
WHERE reference_id=$1 AND reason IN ('sale','release') GROUP BY variant_id,lot_id ORDER BY variant_id,lot_id;
