package postgres

import (
	"context"
	"github.com/freedomCruz/monte-luna/backend/internal/payments/domain"
)

func (r *Repository) AdminPayments(ctx context.Context, ids []string) (map[string]domain.AdminPaymentSummary, error) {
	result := make(map[string]domain.AdminPaymentSummary)
	rows, err := r.pool.Query(ctx, `SELECT DISTINCT ON(order_id) order_id::text,status,lower(payment_method_type)
 FROM payments.payment_attempts WHERE order_id=ANY($1::uuid[]) AND status<>'duplicate_approved'
 ORDER BY order_id,(status='approved') DESC,created_at DESC,id DESC`, ids)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var id string
		var s domain.AdminPaymentSummary
		if err := rows.Scan(&id, &s.Status, &s.Method); err != nil {
			return nil, err
		}
		result[id] = s
	}
	return result, rows.Err()
}
func (r *Repository) PaymentAttempts(ctx context.Context, id string) ([]domain.AdminAttempt, error) {
	result := []domain.AdminAttempt{}
	rows, err := r.pool.Query(ctx, `SELECT id::text,reference,status,lower(payment_method_type),provider_transaction_id,created_at,finalized_at FROM payments.payment_attempts WHERE order_id=$1 ORDER BY created_at,id`, id)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var a domain.AdminAttempt
		if err := rows.Scan(&a.ID, &a.Reference, &a.Status, &a.Method, &a.ProviderID, &a.CreatedAt, &a.FinalizedAt); err != nil {
			return nil, err
		}
		a.CreatedAt = a.CreatedAt.UTC()
		if a.FinalizedAt != nil {
			v := a.FinalizedAt.UTC()
			a.FinalizedAt = &v
		}
		result = append(result, a)
	}
	return result, rows.Err()
}
func (r *Repository) PendingManualRefunds(ctx context.Context) (int64, error) {
	var count int64
	err := r.pool.QueryRow(ctx, `SELECT count(*) FROM payments.refunds WHERE method='manual' AND status='pending'`).Scan(&count)
	return count, err
}
