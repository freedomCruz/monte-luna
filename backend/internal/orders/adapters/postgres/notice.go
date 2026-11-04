package postgres

import (
	"context"
	"errors"

	"github.com/freedomCruz/monte-luna/backend/internal/orders/domain"
	"github.com/jackc/pgx/v5"
)

func (r *Repository) OrderNotice(ctx context.Context, id string) (domain.OrderNotice, error) {
	var n domain.OrderNotice
	err := r.pool.QueryRow(ctx, `SELECT o.order_number,o.customer_email,o.customer_name,
	(SELECT h.note FROM orders.order_status_history h WHERE h.order_id=o.id AND h.to_status='cancelled' AND h.actor_type='admin' ORDER BY h.created_at DESC,h.id DESC LIMIT 1)
	FROM orders.orders o WHERE o.id=$1`, id).Scan(&n.OrderNumber, &n.Email, &n.Name, &n.CancelReason)
	if errors.Is(err, pgx.ErrNoRows) {
		return n, &domain.Error{Status: 404, Code: "order_not_found"}
	}
	return n, err
}
