package main

import (
	"context"
	"errors"

	"github.com/freedomCruz/monte-luna/backend/internal/orders"
	"github.com/freedomCruz/monte-luna/backend/internal/shipping"
)

// The composition root avoids an orders/shipping import cycle while translating
// consumer-side port errors without exposing either module's private packages.
type shipmentOrders struct{ module *orders.Module }

func (p shipmentOrders) WithDispatchOrder(ctx context.Context, id string, version int32, fn func(context.Context) error) error {
	err := p.module.WithDispatchOrder(ctx, id, version, fn)
	var problem *orders.AdminOrderError
	if errors.As(err, &problem) {
		switch problem.Code {
		case "order_not_found":
			return shipping.ErrOrderNotFound
		case "version_conflict":
			return shipping.ErrVersionConflict
		case "invalid_order_transition":
			return shipping.ErrInvalidTransition
		}
	}
	return err
}
