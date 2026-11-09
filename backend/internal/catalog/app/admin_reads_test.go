package app_test

import (
	"context"
	"errors"
	"github.com/freedomCruz/monte-luna/backend/internal/catalog/app"
	"github.com/freedomCruz/monte-luna/backend/internal/catalog/domain"
	"testing"
	"time"
)

type readRepo struct{ domain.AdminReadRepository }

func (readRepo) AdminInventory(context.Context, domain.AdminReadFilter) (domain.AdminPage[domain.AdminInventoryVariant], error) {
	return domain.AdminPage[domain.AdminInventoryVariant]{Items: []domain.AdminInventoryVariant{{VariantID: "v", AvailableQuantity: 9}, {VariantID: "zero", AvailableQuantity: 0}, {VariantID: "ten", AvailableQuantity: 10}}, Total: 3}, nil
}
func (readRepo) AdminLots(context.Context, domain.AdminReadFilter) (domain.AdminPage[domain.AdminVariantLot], string, error) {
	return domain.AdminPage[domain.AdminVariantLot]{Items: []domain.AdminVariantLot{{ID: "l", ProductionDate: "2026-10-01"}}, Total: 1}, "coffee", nil
}
func (readRepo) AdminMovements(context.Context, domain.AdminReadFilter) (domain.AdminPage[domain.AdminInventoryMovement], error) {
	a, b := "a", "missing"
	return domain.AdminPage[domain.AdminInventoryMovement]{Items: []domain.AdminInventoryMovement{{ID: "1", Reason: "sale", ReferenceID: &a, ActorID: &a}, {ID: "2", Reason: "sale", ReferenceID: &b, ActorID: &b}, {ID: "3", Reason: "release"}}, Total: 3}, nil
}

type readOrders struct {
	err   error
	state string
}

func (o readOrders) HeldQuantities(context.Context, []string) ([]domain.HeldQuantity, error) {
	return []domain.HeldQuantity{{VariantID: "v", LotID: "l", Quantity: 3}}, o.err
}
func (o readOrders) MovementOrders(context.Context, []string) (map[string]domain.AdminMovementOrder, error) {
	return map[string]domain.AdminMovementOrder{"a": {ID: "a", ReservationState: o.state}}, o.err
}

type readNames struct{ err error }

func (n readNames) Names(context.Context, []string) (map[string]string, error) {
	return map[string]string{"a": "Admin"}, n.err
}
func TestAdminReadComposition(t *testing.T) {
	at := time.Date(2026, 11, 1, 5, 0, 0, 0, time.UTC)
	s := app.NewAdminReads(readRepo{}, nil, readOrders{state: "held"}, readNames{}, func() time.Time { return at })
	f := domain.AdminReadFilter{ID: "v"}
	inv, err := s.Inventory(t.Context(), f)
	if err != nil || inv.Items[0].ReservedQuantity != 3 || !inv.Items[0].LowStock || inv.Items[0].GeneratedAt != at {
		t.Fatalf("inventory %+v %v", inv, err)
	}
	if !inv.Items[1].LowStock || inv.Items[2].LowStock {
		t.Fatalf("stock boundaries %+v", inv.Items)
	}
	before := at.Add(-time.Nanosecond)
	beforeService := app.NewAdminReads(readRepo{}, nil, readOrders{}, readNames{}, func() time.Time { return before })
	beforeLots, err := beforeService.Lots(t.Context(), f)
	if err != nil || beforeLots.Items[0].OldRoast {
		t.Fatalf("exactly 30 days %+v %v", beforeLots, err)
	}
	lots, err := s.Lots(t.Context(), f)
	if err != nil || !lots.Items[0].OldRoast || lots.Items[0].ReservedQuantity != 3 {
		t.Fatalf("lots %+v %v", lots, err)
	}
	for _, tt := range []struct{ state, want string }{{"held", "reservation"}, {"committed", "sale"}, {"released", "allocation"}} {
		s := app.NewAdminReads(readRepo{}, nil, readOrders{state: tt.state}, readNames{}, func() time.Time { return at })
		movements, err := s.Movements(t.Context(), f)
		if err != nil {
			t.Fatal(err)
		}
		if m := movements.Items[0]; m.DisplayKind != tt.want || m.ActorName == nil || *m.ActorName != "Admin" {
			t.Fatalf("movement %+v", m)
		}
		if m := movements.Items[1]; m.DisplayKind != "allocation" || m.Order != nil || m.ActorName != nil {
			t.Fatalf("missing %+v", m)
		}
		if m := movements.Items[2]; m.DisplayKind != "release" || m.ActorName != nil {
			t.Fatalf("system %+v", m)
		}
	}
	for _, tt := range []struct{ orders, names error }{{errors.New("orders unavailable"), nil}, {nil, errors.New("identity unavailable")}} {
		s := app.NewAdminReads(readRepo{}, nil, readOrders{err: tt.orders}, readNames{err: tt.names}, func() time.Time { return at })
		_, err := s.Movements(t.Context(), f)
		var p *domain.Error
		if !errors.As(err, &p) || p.Status != 503 || p.Code != "dependency_unavailable" {
			t.Fatalf("dependency failure %v", err)
		}
	}
}
