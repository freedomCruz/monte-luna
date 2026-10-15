package app

import (
	"context"
	"github.com/freedomCruz/monte-luna/backend/internal/orders/domain"
)

type Maintenance struct {
	repository domain.ExpiryRepository
	inventory  domain.InventoryPort
	clock      domain.Clock
}

func NewMaintenance(repository domain.ExpiryRepository, inventory domain.InventoryPort, clock domain.Clock) *Maintenance {
	return &Maintenance{repository: repository, inventory: inventory, clock: clock}
}
func (m *Maintenance) Run(ctx context.Context) (int, error) {
	now := m.clock.Now().UTC()
	count, err := m.repository.Expire(ctx, now, m.inventory.Release)
	if err != nil {
		return count, err
	}
	return count, m.repository.Cleanup(ctx, now)
}
