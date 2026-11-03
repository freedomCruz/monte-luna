package orders

import (
	"context"

	"github.com/freedomCruz/monte-luna/backend/internal/orders/domain"
)

// AdminOrderError exposes safe status/code values across module boundaries.
type AdminOrderError = domain.Error

// WithDispatchOrder serializes a shipping dispatch with orders-owned admin
// transitions. Only the callback commits shipping data; this guard changes no
// order state. Shipment events subsequently update orders in their own transaction.
// B3 cancellation must lock this same order row before checking fulfillment.
func (m *Module) WithDispatchOrder(ctx context.Context, id string, version int32, dispatch func(context.Context) error) error {
	if m.repository == nil || dispatch == nil {
		return &domain.Error{Status: 500, Code: "internal_error"}
	}
	return m.repository.WithDispatchOrder(ctx, id, version, dispatch)
}
