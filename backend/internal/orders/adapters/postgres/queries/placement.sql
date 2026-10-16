-- name: LockIdempotencyKey :exec
SELECT pg_advisory_xact_lock(hashtextextended('orders:idempotency:' || sqlc.arg(key)::text,0));

-- name: GetIdempotency :one
SELECT * FROM orders.idempotency_keys WHERE key=$1;

-- name: TrackingHashExists :one
SELECT EXISTS(SELECT 1 FROM orders.orders WHERE tracking_token_hash=$1);

-- name: NewOrderID :one
SELECT uuidv7()::uuid;

-- name: InsertOrder :exec
INSERT INTO orders.orders(id,order_number,status,subtotal_amount,shipping_amount,tax_amount,total_amount,
shipping_rate_name,shipping_estimated_days_min,shipping_estimated_days_max,customer_email,customer_name,customer_phone,
buyer_person_type,buyer_document_type,buyer_document_number,fiscal_profile_snapshot,tracking_token_hash,reservation_expires_at,placed_at,shipping_is_free_shipping)
VALUES($1,$2,'pending_payment',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20);

-- name: InsertOrderLine :one
INSERT INTO orders.order_lines(order_id,product_id,variant_id,sku,product_slug,product_title,variant_label,unit_price_amount,quantity,
tax_category,tax_rate_bps,tax_amount,line_total_amount,weight_grams)
VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING id;

-- name: InsertAllocation :exec
INSERT INTO orders.order_line_lot_allocations(order_line_id,lot_id,lot_code,production_date,quantity) VALUES($1,$2,$3,$4,$5);

-- name: InsertShippingAddress :exec
INSERT INTO orders.order_shipping_addresses(order_id,recipient_name,phone,address_line1,address_line2,department_name,municipality_code,municipality_name,postal_code,delivery_notes)
VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10);

-- name: InsertOrderHistory :exec
INSERT INTO orders.order_status_history(order_id,from_status,to_status,actor_type,created_at) VALUES($1,$2,$3,'system',$4);

-- name: InsertOrderEvent :exec
INSERT INTO orders.outbox(type,occurred_at,payload) VALUES($1,$2,$3);

-- name: InsertIdempotency :exec
INSERT INTO orders.idempotency_keys(key,request_hash,order_id,response_status,response_body,created_at,expires_at) VALUES($1,$2,$3,201,$4,$5,$6);

-- name: ReadGuestLines :many
SELECT l.variant_id,l.product_slug,l.product_title,l.variant_label,l.sku,l.unit_price_amount,l.quantity,l.line_total_amount,
min(a.production_date)::date AS production_date
FROM orders.order_lines l LEFT JOIN orders.order_line_lot_allocations a ON a.order_line_id=l.id
WHERE l.order_id=$1 GROUP BY l.id ORDER BY l.created_at,l.id;

-- name: LockExpiredOrder :one
SELECT * FROM orders.orders WHERE status='pending_payment' AND reservation_expires_at <= $1
ORDER BY reservation_expires_at,id LIMIT 1 FOR UPDATE SKIP LOCKED;

-- name: SetOrderExpired :execrows
UPDATE orders.orders SET status='expired',version=version+1,updated_at=$2 WHERE id=$1 AND status='pending_payment';

-- name: CleanupIdempotency :execrows
DELETE FROM orders.idempotency_keys WHERE expires_at <= $1;
