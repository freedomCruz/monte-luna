package main

import (
	"context"
	"github.com/freedomCruz/monte-luna/backend/internal/orders"
	"github.com/freedomCruz/monte-luna/backend/internal/payments"
	"github.com/freedomCruz/monte-luna/backend/internal/shipping"
)

type adminOrderPayments struct{ module *payments.Module }

func (p adminOrderPayments) AdminPayments(ctx context.Context, ids []string) (map[string]orders.AdminPaymentSummary, error) {
	rows, err := p.module.AdminPayments(ctx, ids)
	if err != nil {
		return nil, err
	}
	out := make(map[string]orders.AdminPaymentSummary, len(rows))
	for id, row := range rows {
		out[id] = orders.AdminPaymentSummary(row)
	}
	return out, nil
}
func (p adminOrderPayments) PaymentAttempts(ctx context.Context, id string) ([]orders.AdminPaymentAttempt, error) {
	rows, err := p.module.PaymentAttempts(ctx, id)
	if err != nil {
		return nil, err
	}
	out := make([]orders.AdminPaymentAttempt, 0, len(rows))
	for _, row := range rows {
		out = append(out, orders.AdminPaymentAttempt(row))
	}
	return out, nil
}
func (p adminOrderPayments) PendingManualRefunds(ctx context.Context) (int64, error) {
	return p.module.PendingManualRefunds(ctx)
}

type adminOrderShipments struct{ module *shipping.Module }

func (p adminOrderShipments) Shipment(ctx context.Context, id string) (*orders.AdminShipment, error) {
	row, err := p.module.Shipment(ctx, id)
	if err != nil || row == nil {
		return nil, err
	}
	out := orders.AdminShipment(*row)
	return &out, nil
}
