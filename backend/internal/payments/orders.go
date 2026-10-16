package payments

import (
	"context"
	"github.com/freedomCruz/monte-luna/backend/internal/payments/domain"
	"github.com/freedomCruz/monte-luna/backend/internal/platform"
)

func (m *Module) Payment(ctx context.Context, orderID string) (*GuestPayment, error) {
	attempt, err := m.repository.Latest(ctx, orderID)
	if err != nil {
		return nil, err
	}
	return domain.PaymentView(attempt), nil
}
func (m *Module) InFlight(ctx context.Context, orderID string) (bool, error) {
	return m.reconciliation.InFlight(ctx, orderID)
}
func (m *Module) HandleOrderCancelled(ctx context.Context, event platform.Event) error {
	return m.repository.OrderCancelled(ctx, event, m.clock.Now().UTC())
}
