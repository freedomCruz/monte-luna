package main

import (
	"context"
	"github.com/freedomCruz/monte-luna/backend/internal/orders"
	"github.com/freedomCruz/monte-luna/backend/internal/payments"
)

// orderPayments composes the public module facades without private imports.
type orderPayments struct{ module *payments.Module }

func (p orderPayments) Payment(ctx context.Context, orderID string) (*orders.GuestPayment, error) {
	payment, err := p.module.Payment(ctx, orderID)
	if payment == nil || err != nil {
		return nil, err
	}
	return &orders.GuestPayment{Status: payment.Status, Method: payment.Method}, nil
}
func (p orderPayments) InFlight(ctx context.Context, orderID string) (bool, error) {
	return p.module.InFlight(ctx, orderID)
}
