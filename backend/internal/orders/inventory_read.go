package orders

import (
	"context"
	"errors"
	"github.com/freedomCruz/monte-luna/backend/internal/orders/domain"
)

type InventoryOrder = domain.InventoryOrder
type HeldInventory = domain.HeldInventory

// InventoryReadPort is read-only; its consumer is responsible for admin access.
// Requests contain at most 100 unique identifiers. No customer data is exposed.
type InventoryReadPort interface {
	HeldInventory(context.Context, []string) ([]HeldInventory, error)
	InventoryOrders(context.Context, []string) (map[string]InventoryOrder, error)
}

func (m *Module) HeldInventory(ctx context.Context, ids []string) ([]HeldInventory, error) {
	if m.repository == nil {
		return nil, errors.New("orders persistence not configured")
	}
	return m.repository.HeldInventory(ctx, ids)
}
func (m *Module) InventoryOrders(ctx context.Context, ids []string) (map[string]InventoryOrder, error) {
	if m.repository == nil {
		return nil, errors.New("orders persistence not configured")
	}
	return m.repository.InventoryOrders(ctx, ids)
}
