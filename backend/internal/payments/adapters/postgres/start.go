package postgres

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/freedomCruz/monte-luna/backend/internal/payments/domain"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Repository struct {
	pool           *pgxpool.Pool
	refundReporter func(context.Context, string, int64, string)
}

func (r *Repository) SetRefundReporter(report func(context.Context, string, int64, string)) {
	r.refundReporter = report
}

func NewRepository(pool *pgxpool.Pool) *Repository { return &Repository{pool: pool} }

type startTx struct {
	tx           pgx.Tx
	orderID, key string
}

func (r *Repository) BeginStart(ctx context.Context, orderID, key string) (domain.StartTx, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	for _, lock := range []string{"payments:key:" + key, "payments:order:" + orderID} {
		if _, err := tx.Exec(ctx, "SELECT pg_advisory_xact_lock(hashtextextended($1,0))", lock); err != nil {
			_ = tx.Rollback(ctx)
			return nil, err
		}
	}
	return &startTx{tx: tx, orderID: orderID, key: key}, nil
}
func (t *startTx) Replay(ctx context.Context, hash string, now time.Time) (*domain.Checkout, error) {
	var storedHash string
	var expires time.Time
	var body []byte
	err := t.tx.QueryRow(ctx, "SELECT request_hash,expires_at,response_body FROM payments.idempotency_keys WHERE key=$1", t.key).Scan(&storedHash, &expires, &body)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	if storedHash != hash || !expires.After(now) {
		return nil, domain.Problem(422, "idempotency_key_reused")
	}
	var checkout domain.Checkout
	if err := json.Unmarshal(body, &checkout); err != nil {
		return nil, err
	}
	return &checkout, nil
}
func (t *startTx) State(ctx context.Context) (bool, bool, error) {
	var approved, pending bool
	err := t.tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM payments.payment_attempts WHERE order_id=$1 AND status='approved'),EXISTS(SELECT 1 FROM payments.payment_attempts WHERE order_id=$1 AND status='pending')`, t.orderID).Scan(&approved, &pending)
	return approved, pending, err
}
func (t *startTx) Save(ctx context.Context, a domain.Attempt, checkout domain.Checkout, hash string, now time.Time) error {
	var id string
	if err := t.tx.QueryRow(ctx, `INSERT INTO payments.payment_attempts(order_id,reference,amount,currency,status,expires_at,created_at,updated_at) VALUES($1,$2,$3,$4,'created',$5,$6,$6) RETURNING id::text`, a.OrderID, a.Reference, a.Amount, a.Currency, a.ExpiresAt, now).Scan(&id); err != nil {
		return fmt.Errorf("insert payment attempt: %w", err)
	}
	checkout.RedirectURL = "" // Never store the tracking capability in the replay ledger.
	body, err := json.Marshal(checkout)
	if err != nil {
		return err
	}
	_, err = t.tx.Exec(ctx, `INSERT INTO payments.idempotency_keys(key,request_hash,payment_attempt_id,response_body,created_at,expires_at) VALUES($1,$2,$3,$4,$5,$6)`, t.key, hash, id, body, now, now.Add(24*time.Hour))
	return err
}
func (t *startTx) Commit(ctx context.Context) error { return t.tx.Commit(ctx) }
func (t *startTx) Rollback(ctx context.Context) error {
	err := t.tx.Rollback(ctx)
	if errors.Is(err, pgx.ErrTxClosed) {
		return nil
	}
	return err
}
