package orders

import (
	"context"
	"github.com/freedomCruz/monte-luna/backend/internal/orders/adapters/postgres"
	"github.com/freedomCruz/monte-luna/backend/internal/orders/domain"
)

type PaymentOrder = domain.PaymentOrder

func (m *Module) PaymentOrder(ctx context.Context, tokenHash string) (PaymentOrder, bool, error) {
	return postgres.NewRepository(m.pool).PaymentOrder(ctx, tokenHash)
}
