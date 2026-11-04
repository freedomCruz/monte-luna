package shipping

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	"github.com/freedomCruz/monte-luna/backend/internal/platform"
	"github.com/freedomCruz/monte-luna/backend/internal/shipping/adapters/postgres"
	"github.com/freedomCruz/monte-luna/backend/internal/shipping/app"
	"github.com/freedomCruz/monte-luna/backend/internal/shipping/domain"
)

type Shipment = domain.Shipment
type DispatchInput = domain.DispatchInput
type OrderGuard = domain.OrderGuard
type ValidationError = domain.ValidationError

var (
	ErrVersionConflict   = domain.ErrVersionConflict
	ErrOrderNotFound     = domain.ErrOrderNotFound
	ErrInvalidTransition = domain.ErrInvalidTransition
)

// EnableFulfillment runs once at startup, before any requests are served.
func (m *Module) EnableFulfillment(orders OrderGuard, now func() time.Time) error {
	service, err := app.NewDispatch(postgres.NewRepository(m.pool), orders, now)
	if err != nil {
		return err
	}
	m.dispatch = service
	return nil
}
func (m *Module) Dispatch(ctx context.Context, in DispatchInput) (Shipment, error) {
	if m.dispatch == nil {
		return Shipment{}, errors.New("shipping fulfillment is not configured")
	}
	return m.dispatch.Dispatch(ctx, in)
}
func (m *Module) Shipment(ctx context.Context, orderID string) (*Shipment, error) {
	if !domain.ValidID(orderID) {
		return nil, &ValidationError{Field: "order_id"}
	}
	return postgres.NewRepository(m.pool).Shipment(ctx, orderID)
}
func (m *Module) HandleOrderPaid(ctx context.Context, event platform.Event) error {
	var body struct {
		OrderID string `json:"order_id"`
	}
	if event.Type != "orders.order_paid" || !domain.ValidID(event.ID) {
		return errors.New("invalid paid event envelope")
	}
	if err := json.Unmarshal(event.Payload, &body); err != nil {
		return err
	}
	if !domain.ValidID(body.OrderID) {
		return errors.New("invalid paid order identifier")
	}
	return postgres.NewRepository(m.pool).OrderPaid(ctx, event.ID, body.OrderID)
}
func (m *Module) HandleOrderDelivered(ctx context.Context, event platform.Event) error {
	var body struct {
		OrderID     string    `json:"order_id"`
		ActorID     string    `json:"actor_id"`
		DeliveredAt time.Time `json:"delivered_at"`
	}
	if event.Type != "orders.order_delivered" || !domain.ValidID(event.ID) {
		return errors.New("invalid delivered event envelope")
	}
	if err := json.Unmarshal(event.Payload, &body); err != nil {
		return err
	}
	if !domain.ValidID(body.OrderID) || !domain.ValidID(body.ActorID) || body.DeliveredAt.IsZero() {
		return errors.New("invalid delivered event payload")
	}
	return postgres.NewRepository(m.pool).OrderDelivered(ctx, event.ID, body.OrderID, body.DeliveredAt.UTC())
}
