package postgres

import (
	"context"
	"github.com/freedomCruz/monte-luna/backend/internal/orders/domain"
	"time"
)

func (r *Repository) ScanAdminPaid(ctx context.Context, from, to time.Time, visit func(domain.PaidOrder) error) error {
	rows, err := r.pool.Query(ctx, `SELECT o.paid_at,o.total_amount,COALESCE((SELECT sum(l.quantity) FROM orders.order_lines l WHERE l.order_id=o.id),0)::bigint
 FROM orders.orders o WHERE o.status IN ('paid','preparing','shipped','delivered') AND o.paid_at >= $1 AND o.paid_at < $2 ORDER BY o.paid_at,o.id`, from, to)
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
		var p domain.PaidOrder
		if err := rows.Scan(&p.At, &p.Amount, &p.Units); err != nil {
			return err
		}
		p.At = p.At.UTC()
		if err := visit(p); err != nil {
			return err
		}
	}
	return rows.Err()
}
