package postgres

import (
	"context"
	"fmt"
	"github.com/freedomCruz/monte-luna/backend/internal/orders/domain"
)

// HeldInventory is bounded by the caller's variant batch; aggregation happens
// inside orders, never through a catalog-to-orders SQL join.
func (r *Repository) HeldInventory(ctx context.Context, variants []string) ([]domain.HeldInventory, error) {
	out := []domain.HeldInventory{}
	if len(variants) == 0 {
		return out, nil
	}
	if len(variants) > 100 {
		return nil, fmt.Errorf("inventory variant batch exceeds 100")
	}
	rows, err := r.pool.Query(ctx, `SELECT l.variant_id::text,a.lot_id::text,sum(a.quantity)::bigint
 FROM orders.orders o JOIN orders.order_lines l ON l.order_id=o.id
 JOIN orders.order_line_lot_allocations a ON a.order_line_id=l.id
 WHERE o.status='pending_payment' AND l.variant_id=ANY($1::uuid[])
 GROUP BY l.variant_id,a.lot_id`, variants)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var v domain.HeldInventory
		if err := rows.Scan(&v.VariantID, &v.LotID, &v.Quantity); err != nil {
			return nil, err
		}
		out = append(out, v)
	}
	return out, rows.Err()
}
func (r *Repository) InventoryOrders(ctx context.Context, ids []string) (map[string]domain.InventoryOrder, error) {
	out := map[string]domain.InventoryOrder{}
	if len(ids) == 0 {
		return out, nil
	}
	if len(ids) > 100 {
		return nil, fmt.Errorf("inventory order batch exceeds 100")
	}
	rows, err := r.pool.Query(ctx, `SELECT id::text,order_number,status FROM orders.orders WHERE id=ANY($1::uuid[])`, ids)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var v domain.InventoryOrder
		if err := rows.Scan(&v.ID, &v.OrderNumber, &v.Status); err != nil {
			return nil, err
		}
		v.ReservationState = domain.InventoryReservationState(v.Status)
		out[v.ID] = v
	}
	return out, rows.Err()
}
