-- name: FindShipment :one
SELECT id, order_id, status, carrier_name, tracking_number, tracking_url,
       shipped_at, delivered_at, actor_id, version
FROM shipping.shipments WHERE order_id=$1;

-- name: LockShipment :one
SELECT id, order_id, status, carrier_name, tracking_number, tracking_url,
       shipped_at, delivered_at, actor_id, version
FROM shipping.shipments WHERE order_id=$1 FOR UPDATE;

-- name: EnsurePendingShipment :exec
INSERT INTO shipping.shipments(order_id) VALUES($1) ON CONFLICT(order_id) DO NOTHING;

-- name: DispatchShipment :execrows
UPDATE shipping.shipments
SET carrier_name=$2, tracking_number=$3, tracking_url=$4, status='shipped',
    shipped_at=$5, actor_id=$6, version=version+1, updated_at=$5
WHERE order_id=$1 AND status='pending' AND version=$7;

-- name: DeliverShipment :execrows
UPDATE shipping.shipments
SET status='delivered', delivered_at=$2, updated_at=$2, version=version+1
WHERE order_id=$1 AND status='shipped';

-- name: InsertShipmentEvent :exec
INSERT INTO shipping.outbox(type,occurred_at,payload,available_at)
VALUES('shipping.shipment_shipped',$1,$2,$1);
