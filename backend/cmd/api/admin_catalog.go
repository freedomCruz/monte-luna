package main

import (
	"context"
	"github.com/freedomCruz/monte-luna/backend/internal/catalog"
	"github.com/freedomCruz/monte-luna/backend/internal/orders"
)

// The composition root breaks the catalog/orders dependency cycle without
// exposing private module packages or coupling the domains to one another.
type catalogInventoryOrders struct{ port orders.InventoryReadPort }

func (g catalogInventoryOrders) HeldQuantities(ctx context.Context, ids []string) ([]catalog.HeldQuantity, error) {
	values, err := g.port.HeldInventory(ctx, ids)
	if err != nil {
		return nil, err
	}
	out := make([]catalog.HeldQuantity, 0, len(values))
	for _, v := range values {
		out = append(out, catalog.HeldQuantity{VariantID: v.VariantID, LotID: v.LotID, Quantity: v.Quantity})
	}
	return out, nil
}
func (g catalogInventoryOrders) MovementOrders(ctx context.Context, ids []string) (map[string]catalog.AdminMovementOrder, error) {
	values, err := g.port.InventoryOrders(ctx, ids)
	if err != nil {
		return nil, err
	}
	out := map[string]catalog.AdminMovementOrder{}
	for id, v := range values {
		out[id] = catalog.AdminMovementOrder{ID: v.ID, OrderNumber: v.OrderNumber, Status: v.Status, ReservationState: v.ReservationState}
	}
	return out, nil
}
