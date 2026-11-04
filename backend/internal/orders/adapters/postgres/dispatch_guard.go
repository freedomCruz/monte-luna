package postgres

import (
	"context"
	"errors"

	"github.com/freedomCruz/monte-luna/backend/internal/orders/domain"
	"github.com/jackc/pgx/v5"
)

// The order row lock outlives the shipping callback's commit. A cancellation
// queued behind it must consult the committed shipping state before acting.
func (r *Repository) WithDispatchOrder(ctx context.Context, id string, expected int32, dispatch func(context.Context) error) error {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	var status string
	var version int32
	err = tx.QueryRow(ctx, `SELECT status,version FROM orders.orders WHERE id=$1 FOR UPDATE`, id).Scan(&status, &version)
	if errors.Is(err, pgx.ErrNoRows) {
		return &domain.Error{Status: 404, Code: "order_not_found"}
	}
	if err != nil {
		return err
	}
	if expected < 1 || version != expected {
		return &domain.Error{Status: 412, Code: "version_conflict"}
	}
	if status != "paid" && status != "preparing" {
		return &domain.Error{Status: 409, Code: "invalid_order_transition"}
	}
	// This transaction is deliberately lock-only: rollback releases the lock,
	// without a second commit that could ambiguously fail after shipping committed.
	return dispatch(ctx)
}
