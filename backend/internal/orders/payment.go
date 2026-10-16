package orders

import (
	"context"
	"encoding/json"
	"errors"
	"github.com/freedomCruz/monte-luna/backend/internal/orders/adapters/postgres"
	"github.com/freedomCruz/monte-luna/backend/internal/orders/domain"
	"github.com/freedomCruz/monte-luna/backend/internal/platform"
)

type PaymentOrder = domain.PaymentOrder
type GuestPayment = domain.GuestPayment
type PaymentsPort = domain.PaymentsPort

func (m *Module) EnablePayments(port PaymentsPort) { m.repository.EnablePayments(port) }
func (m *Module) OrderNumber(ctx context.Context, id string) (string, error) {
	return m.repository.OrderNumber(ctx, id)
}
func (m *Module) HandlePaymentApproved(ctx context.Context, event platform.Event) error {
	var body struct {
		OrderID string `json:"order_id"`
	}
	if err := json.Unmarshal(event.Payload, &body); err != nil {
		return err
	}
	if body.OrderID == "" {
		return errors.New("payment approval is missing order identifier")
	}
	return m.repository.ConfirmPayment(ctx, event.ID, body.OrderID, m.clock.Now().UTC(), m.inventory)
}

func (m *Module) PaymentOrder(ctx context.Context, tokenHash string) (PaymentOrder, bool, error) {
	return postgres.NewRepository(m.pool).PaymentOrder(ctx, tokenHash)
}
