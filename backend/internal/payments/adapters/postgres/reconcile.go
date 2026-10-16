package postgres

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/freedomCruz/monte-luna/backend/internal/payments/domain"
	"github.com/jackc/pgx/v5"
)

const attemptColumns = `id::text,order_id::text,reference,status,currency,amount,provider_transaction_id,payment_method_type,status_message,expires_at,created_at,finalized_at`

func scanAttempt(row pgx.Row) (*domain.Attempt, error) {
	var a domain.Attempt
	err := row.Scan(&a.ID, &a.OrderID, &a.Reference, &a.Status, &a.Currency, &a.Amount, &a.ProviderID, &a.Method, &a.StatusMessage, &a.ExpiresAt, &a.CreatedAt, &a.FinalizedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	return &a, err
}
func (r *Repository) Latest(ctx context.Context, orderID string) (*domain.Attempt, error) {
	return scanAttempt(r.pool.QueryRow(ctx, `SELECT `+attemptColumns+` FROM payments.payment_attempts WHERE order_id=$1 AND status<>'duplicate_approved' ORDER BY (status='approved') DESC,created_at DESC,id DESC LIMIT 1`, orderID))
}
func (r *Repository) ByReference(ctx context.Context, orderID, reference string) (*domain.Attempt, error) {
	return scanAttempt(r.pool.QueryRow(ctx, `SELECT `+attemptColumns+` FROM payments.payment_attempts WHERE order_id=$1 AND reference=$2`, orderID, reference))
}

// Apply is shared by signed webhooks and private provider queries. State,
// deduplication and the outbox commit together under the per-order lock.
func (r *Repository) Apply(ctx context.Context, transaction domain.Transaction, checksum string, now time.Time) error {
	status, err := domain.ProviderStatus(transaction.Status)
	if err != nil {
		return err
	}
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	if checksum != "" {
		inserted, err := tx.Exec(ctx, `INSERT INTO payments.provider_webhook_events(dedup_key,event_type,received_at) VALUES($1,'transaction.updated',$2) ON CONFLICT(provider,dedup_key) DO NOTHING`, checksum, now)
		if err != nil {
			return err
		}
		if inserted.RowsAffected() == 0 {
			return nil
		}
	}
	var orderID string
	err = tx.QueryRow(ctx, "SELECT order_id::text FROM payments.payment_attempts WHERE reference=$1", transaction.Reference).Scan(&orderID)
	if errors.Is(err, pgx.ErrNoRows) {
		return tx.Commit(ctx)
	}
	if err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, "SELECT pg_advisory_xact_lock(hashtextextended($1,0))", "payments:order:"+orderID); err != nil {
		return err
	}
	attempt, err := scanAttempt(tx.QueryRow(ctx, `SELECT `+attemptColumns+` FROM payments.payment_attempts WHERE reference=$1 FOR UPDATE`, transaction.Reference))
	if err != nil {
		return err
	}
	if attempt.Amount != transaction.Amount || attempt.Currency != transaction.Currency || (attempt.ProviderID != nil && *attempt.ProviderID != transaction.ID) {
		return domain.Problem(422, "payment_transaction_mismatch")
	}
	if domain.Terminal(attempt.Status) {
		return tx.Commit(ctx)
	}
	duplicate := false
	if status == "approved" {
		if err := tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM payments.payment_attempts WHERE order_id=$1 AND status='approved' AND id<>$2)`, attempt.OrderID, attempt.ID).Scan(&duplicate); err != nil {
			return err
		}
		if duplicate {
			status = "duplicate_approved"
		}
	}
	finalized := transaction.FinalizedAt
	if domain.Terminal(status) && finalized == nil {
		finalized = &now
	}
	_, err = tx.Exec(ctx, `UPDATE payments.payment_attempts SET status=$2,provider_transaction_id=$3,payment_method_type=$4,status_message=$5,finalized_at=$6,updated_at=$7 WHERE id=$1`, attempt.ID, status, transaction.ID, transaction.Method, transaction.StatusMessage, finalized, now)
	if err != nil {
		return err
	}
	if status == "approved" || status == "declined" || status == "error" || status == "expired" {
		eventType := "payments.payment_failed"
		payload := map[string]any{"payment_attempt_id": attempt.ID, "order_id": attempt.OrderID, "status": status, "status_message": transaction.StatusMessage, "failed_at": finalized}
		if status == "approved" {
			eventType = "payments.payment_approved"
			payload = map[string]any{"payment_attempt_id": attempt.ID, "order_id": attempt.OrderID, "amount": attempt.Amount, "currency": attempt.Currency, "provider_transaction_id": transaction.ID, "payment_method_type": transaction.Method, "approved_at": finalized}
		}
		body, err := json.Marshal(payload)
		if err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `INSERT INTO payments.outbox(type,occurred_at,payload,available_at) VALUES($1,$2,$3,$2)`, eventType, now, body); err != nil {
			return fmt.Errorf("write payment event: %w", err)
		}
	}
	if duplicate {
		if _, err := insertRefund(ctx, tx, attempt, "duplicate_payment", now); err != nil {
			return err
		}
	}
	if err := tx.Commit(ctx); err != nil {
		return err
	}
	if duplicate && r.refundReporter != nil {
		r.refundReporter(ctx, attempt.OrderID, attempt.Amount, "duplicate_payment")
	}
	return nil
}
func (r *Repository) CleanupWebhooks(ctx context.Context, now time.Time, retention time.Duration, batch int) error {
	_, err := r.pool.Exec(ctx, `DELETE FROM payments.provider_webhook_events WHERE id IN (SELECT id FROM payments.provider_webhook_events WHERE received_at < $1 ORDER BY received_at,id LIMIT $2)`, now.Add(-retention), batch)
	return err
}
