package app

import (
	"context"
	"errors"
	"time"

	"github.com/freedomCruz/monte-luna/backend/internal/orders/domain"
)

type AdminWrites struct {
	repo      domain.AdminWriteRepository
	inventory domain.OrderInventory
	shipments domain.AdminShipmentsPort
	reads     *AdminReads
	now       func() time.Time
}

func NewAdminWrites(repo domain.AdminWriteRepository, inventory domain.OrderInventory, shipments domain.AdminShipmentsPort, reads *AdminReads, now func() time.Time) (*AdminWrites, error) {
	if repo == nil || inventory == nil || shipments == nil || reads == nil || now == nil {
		return nil, errors.New("orders admin write dependencies are required")
	}
	return &AdminWrites{repo, inventory, shipments, reads, now}, nil
}

// Apply runs one admin status change and returns the refreshed order.
func (s *AdminWrites) Apply(ctx context.Context, action, id string, version int32, actorID string, reason *string) (domain.AdminOrder, error) {
	if _, err := domain.NormalizeKey(id); err != nil {
		return domain.AdminOrder{}, domain.BadAdminQuery()
	}
	w := domain.AdminWrite{OrderID: id, Version: version, ActorID: actorID, Action: action, At: s.now().UTC(), Release: s.inventory.Release, Dispatch: s.dispatched}
	if action == domain.AdminCancel {
		w.Note = domain.CancelNote(reason)
	}
	if err := s.repo.AdminTransition(ctx, w); err != nil {
		return domain.AdminOrder{}, err
	}
	return s.reads.Detail(ctx, id)
}

func (s *AdminWrites) dispatched(ctx context.Context, id string) (bool, error) {
	shipment, err := s.shipments.Shipment(ctx, id)
	if err != nil || shipment == nil {
		return false, err
	}
	return shipment.Status != "pending", nil
}
