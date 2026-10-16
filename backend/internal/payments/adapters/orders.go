package adapters

import (
	"context"
	"github.com/freedomCruz/monte-luna/backend/internal/orders"
	"github.com/freedomCruz/monte-luna/backend/internal/payments/domain"
)

type OrderReader interface {
	PaymentOrder(context.Context, string) (orders.PaymentOrder, bool, error)
}
type OrdersGateway struct{ Reader OrderReader }

func (g OrdersGateway) Authorize(ctx context.Context, hash string) (domain.Order, error) {
	order, found, err := g.Reader.PaymentOrder(ctx, hash)
	if err != nil {
		return domain.Order{}, err
	}
	if !found {
		return domain.Order{}, domain.Problem(404, "order_not_found")
	}
	return domain.Order{ID: order.ID, Number: order.Number, Status: order.Status, Currency: order.Currency, Amount: order.Amount, ExpiresAt: order.ExpiresAt, PlacedAt: order.PlacedAt}, nil
}
