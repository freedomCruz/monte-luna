package postgres

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	"github.com/freedomCruz/monte-luna/backend/internal/payments/domain"
	"github.com/freedomCruz/monte-luna/backend/internal/platform"
	"github.com/jackc/pgx/v5"
)

func insertRefund(ctx context.Context, tx pgx.Tx, attempt *domain.Attempt, reason string, now time.Time) (bool, error) {
	if err := domain.ValidateRefund(attempt.Amount, 0, attempt.Amount); err != nil {
		return false, err
	}
	result, err := tx.Exec(ctx, `INSERT INTO payments.refunds(payment_attempt_id,order_id,amount,currency,reason,method,status,created_at,updated_at) SELECT $1,$2,$3,$4,$5,'manual','pending',$6,$6 WHERE NOT EXISTS(SELECT 1 FROM payments.refunds WHERE payment_attempt_id=$1)`, attempt.ID, attempt.OrderID, attempt.Amount, attempt.Currency, reason, now)
	if err != nil {
		return false, err
	}
	return result.RowsAffected() == 1, nil
}
func (r *Repository) OrderCancelled(ctx context.Context, event platform.Event, now time.Time) error {
	var payload struct {
		OrderID string `json:"order_id"`
		Reason  string `json:"reason"`
	}
	if err := json.Unmarshal(event.Payload, &payload); err != nil {
		return err
	}
	if payload.OrderID == "" {
		return errors.New("cancelled event is missing order identifier")
	}
	switch payload.Reason {
	case "late_payment_no_stock", "order_cancelled", "customer_request":
	default:
		return errors.New("cancelled event has unsupported refund reason")
	}
	var notice *domain.Attempt
	err := platform.ConsumeOnce(ctx, r.pool, "payments", event.ID, func(tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, "SELECT pg_advisory_xact_lock(hashtextextended($1,0))", "payments:order:"+payload.OrderID); err != nil {
			return err
		}
		attempt, err := scanAttempt(tx.QueryRow(ctx, `SELECT `+attemptColumns+` FROM payments.payment_attempts WHERE order_id=$1 AND status='approved' FOR UPDATE`, payload.OrderID))
		if err != nil || attempt == nil {
			return err
		}
		inserted, err := insertRefund(ctx, tx, attempt, payload.Reason, now)
		if err != nil {
			return err
		}
		if inserted {
			notice = attempt
		}
		return nil
	})
	if err == nil && notice != nil && r.refundReporter != nil {
		r.refundReporter(ctx, notice.OrderID, notice.Amount, payload.Reason)
	}
	return err
}
func (r *Repository) Active(ctx context.Context, orderID string) ([]domain.Attempt, error) {
	rows, err := r.pool.Query(ctx, `SELECT `+attemptColumns+` FROM payments.payment_attempts WHERE order_id=$1 AND status IN ('created','pending') ORDER BY created_at DESC,id DESC`, orderID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var attempts []domain.Attempt
	for rows.Next() {
		a, err := scanAttempt(rows)
		if err != nil {
			return nil, err
		}
		attempts = append(attempts, *a)
	}
	return attempts, rows.Err()
}
