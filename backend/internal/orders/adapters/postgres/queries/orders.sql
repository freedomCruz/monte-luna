-- name: GetOrderByTrackingHash :one
SELECT * FROM orders.orders WHERE tracking_token_hash = $1;

-- name: ListOrderLines :many
SELECT * FROM orders.order_lines WHERE order_id = $1 ORDER BY created_at,id;

-- name: ListLineAllocations :many
SELECT * FROM orders.order_line_lot_allocations WHERE order_line_id = $1 ORDER BY production_date,id;

-- name: GetShippingAddress :one
SELECT * FROM orders.order_shipping_addresses WHERE order_id = $1;

-- name: ListOrderHistory :many
SELECT * FROM orders.order_status_history WHERE order_id = $1 ORDER BY created_at,id;

-- name: ReadPendingOutbox :many
SELECT * FROM orders.outbox WHERE status='pending' AND available_at <= $1 ORDER BY available_at,id LIMIT $2;
