package payments

import (
	"context"
	"github.com/freedomCruz/monte-luna/backend/internal/payments/domain"
)

type AdminPaymentSummary = domain.AdminPaymentSummary
type AdminAttempt = domain.AdminAttempt

// Admin read ports are called only after the consuming module authorizes access.
func (m *Module) AdminPayments(ctx context.Context, ids []string) (map[string]AdminPaymentSummary, error) {
	return m.repository.AdminPayments(ctx, ids)
}
func (m *Module) PaymentAttempts(ctx context.Context, id string) ([]AdminAttempt, error) {
	return m.repository.PaymentAttempts(ctx, id)
}

// PendingManualRefunds is owner-only; consumers must not call it for staff.
func (m *Module) PendingManualRefunds(ctx context.Context) (int64, error) {
	return m.repository.PendingManualRefunds(ctx)
}
