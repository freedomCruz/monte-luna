package app

import (
	"context"
	"errors"
	"time"

	"github.com/freedomCruz/monte-luna/backend/internal/shipping/domain"
)

type Dispatch struct {
	repository domain.ShipmentRepository
	orders     domain.OrderGuard
	now        func() time.Time
}

func NewDispatch(repo domain.ShipmentRepository, orders domain.OrderGuard, now func() time.Time) (*Dispatch, error) {
	if repo == nil || orders == nil || now == nil {
		return nil, errors.New("dispatch dependencies are required")
	}
	return &Dispatch{repository: repo, orders: orders, now: now}, nil
}
func (s *Dispatch) Dispatch(ctx context.Context, in domain.DispatchInput) (domain.Shipment, error) {
	in, err := domain.NormalizeDispatch(in)
	if err != nil {
		return domain.Shipment{}, err
	}
	var result domain.Shipment
	err = s.orders.WithDispatchOrder(ctx, in.OrderID, in.OrderVersion, func(ctx context.Context) error {
		var writeErr error
		result, writeErr = s.repository.Dispatch(ctx, in, s.now().UTC())
		return writeErr
	})
	if err != nil {
		return domain.Shipment{}, err
	}
	return result, nil
}
