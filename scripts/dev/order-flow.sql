-- Inspect the full persisted flow of one order. Usage (from the repo root):
--   docker cp scripts/dev/order-flow.sql ecommerce-postgres-1:/tmp/order-flow.sql
--   docker exec -it ecommerce-postgres-1 sh -c 'psql -U "$POSTGRES_USER" -d <WORKTREE_DB> -v ord=ORD-XXXXXXXX -f /tmp/order-flow.sql'
-- task setup:preview prints WORKTREE_DB.
\if :{?ord}
\else
  \echo 'Pass the order number with -v ord=ORD-XXXXXXXX'
  \quit
\endif

\echo '== 1. Order'
SELECT order_number, status, subtotal_amount, shipping_amount, total_amount, customer_email, placed_at, reservation_expires_at
FROM orders.orders WHERE order_number = :'ord';

\echo '== 2. Lines and allocated lots'
SELECT l.product_title, l.variant_label, l.quantity, l.unit_price_amount, l.line_total_amount, a.lot_code, a.quantity AS lot_quantity
FROM orders.order_lines l
JOIN orders.orders o ON o.id = l.order_id
LEFT JOIN orders.order_line_lot_allocations a ON a.order_line_id = l.id
WHERE o.order_number = :'ord';

\echo '== 3. Status history'
SELECT h.from_status, h.to_status, h.actor_type, h.note, h.created_at
FROM orders.order_status_history h
JOIN orders.orders o ON o.id = h.order_id
WHERE o.order_number = :'ord'
ORDER BY h.created_at;

\echo '== 4. Payment attempts'
SELECT p.reference, p.status, p.payment_method_type, p.amount, p.provider_transaction_id, p.status_message, p.created_at, p.finalized_at
FROM payments.payment_attempts p
JOIN orders.orders o ON o.id = p.order_id
WHERE o.order_number = :'ord'
ORDER BY p.created_at;

\echo '== 5. Outbox events for this order'
SELECT 'orders' AS module, type, status, attempts, delivered_at
FROM orders.outbox
WHERE payload::text LIKE '%' || (SELECT id::text FROM orders.orders WHERE order_number = :'ord') || '%'
UNION ALL
SELECT 'payments', type, status, attempts, delivered_at
FROM payments.outbox
WHERE payload::text LIKE '%' || (SELECT id::text FROM orders.orders WHERE order_number = :'ord') || '%'
ORDER BY delivered_at;

\echo '== 6. Inventory movements'
SELECT m.reason, m.quantity_delta, m.created_at
FROM catalog.inventory_movements m
WHERE m.reference_id::text = (SELECT id::text FROM orders.orders WHERE order_number = :'ord')
ORDER BY m.created_at;

\echo '== 7. Refunds (empty for a normal paid order)'
SELECT r.reason, r.method, r.status, r.amount
FROM payments.refunds r
JOIN orders.orders o ON o.id = r.order_id
WHERE o.order_number = :'ord';
