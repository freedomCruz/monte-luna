package postgres

import (
	"context"
	"errors"

	"github.com/freedomCruz/monte-luna/backend/internal/orders/domain"
	"github.com/jackc/pgx/v5"
)

func (r *Repository) PaymentOrder(ctx context.Context, tokenHash string) (domain.PaymentOrder, bool, error) {
	var order domain.PaymentOrder
	err := r.pool.QueryRow(ctx, `SELECT id::text,order_number,status,currency,total_amount,reservation_expires_at,placed_at FROM orders.orders WHERE tracking_token_hash=$1`, tokenHash).Scan(&order.ID, &order.Number, &order.Status, &order.Currency, &order.Amount, &order.ExpiresAt, &order.PlacedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return order, false, nil
	}
	return order, err == nil, err
}
