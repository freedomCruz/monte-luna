package app_test

import (
	"context"
	"errors"
	"github.com/freedomCruz/monte-luna/backend/internal/orders/app"
	"github.com/freedomCruz/monte-luna/backend/internal/orders/domain"
	"testing"
	"time"
)

type placementFixture struct {
	saved                          domain.Order
	replay                         *domain.PlacedOrder
	failSave                       bool
	released, allocated, committed int
	collisions                     int
	clock                          time.Time
}

func (f *placementFixture) BeginPlacement(context.Context, string) (domain.PlacementTx, error) {
	return f, nil
}
func (f *placementFixture) Replay(context.Context, string, time.Time) (*domain.PlacedOrder, error) {
	return f.replay, nil
}
func (f *placementFixture) TokenExists(context.Context, string) (bool, error) { return false, nil }
func (f *placementFixture) NewID(context.Context) (string, error)             { return id, nil }
func (f *placementFixture) Save(_ context.Context, order domain.Order) error {
	if f.collisions > 0 {
		f.collisions--
		return domain.ErrOrderNumberCollision
	}
	if f.failSave {
		return errors.New("injected persistence failure")
	}
	f.saved = order
	return nil
}
func (f *placementFixture) Commit(context.Context) error   { f.committed++; return nil }
func (f *placementFixture) Rollback(context.Context) error { return nil }
func (f *placementFixture) Allocate(context.Context, string, []domain.Item) ([]domain.Allocation, error) {
	f.allocated++
	return []domain.Allocation{{VariantID: id, LotID: id, LotCode: "DEMO", ProductionDate: "2026-10-01", Quantity: 1}}, nil
}
func (f *placementFixture) Release(context.Context, string) error { f.released++; return nil }
func (f *placementFixture) LookupAddress(string) (string, string, error) {
	return "Bogotá, D. C.", "Bogotá, D. C.", nil
}
func (f *placementFixture) Now() time.Time               { return f.clock }
func (f *placementFixture) OrderNumber() (string, error) { return "ORD-7K2M9Q4X", nil }
func placementRequest() domain.PlaceRequest {
	return domain.PlaceRequest{Items: []domain.Item{{VariantID: id, Quantity: 1}}, Customer: domain.Customer{Email: "Demo@example.com", FullName: "Demo Buyer"}, Address: domain.Address{RecipientName: "Demo Recipient", RecipientPhone: "3001234567", MunicipalityCode: "11001", AddressLine1: "Calle 5 # 12-34"}, AcceptsDataPolicy: true}
}
func TestPlacementCompensationReplayAndReservation(t *testing.T) {
	for _, tc := range []struct {
		name         string
		fail, replay bool
		collisions   int
	}{
		{"success", false, false, 0}, {"persistence failure", true, false, 0}, {"idempotent replay", false, true, 0}, {"order number collision retry", false, false, 1},
	} {
		t.Run(tc.name, func(t *testing.T) {
			d := fixture()
			f := &placementFixture{failSave: tc.fail, collisions: tc.collisions, clock: time.Date(2026, 10, 15, 12, 0, 0, 0, time.UTC)}
			if tc.replay {
				f.replay = &domain.PlacedOrder{OrderID: id, OrderNumber: "ORD-7K2M9Q4X", Status: "pending_payment", TotalAmount: 4600000, ReservationExpiresAt: f.clock.Add(30 * time.Minute)}
			}
			service := app.NewPlacement(app.NewService(d, d, d), f, f, f, f, f, []byte("12345678901234567890123456789012"))
			result, err := service.Place(t.Context(), id, placementRequest())
			if tc.fail {
				if err == nil || f.released != 1 || f.committed != 0 {
					t.Fatalf("error=%v release=%d commit=%d", err, f.released, f.committed)
				}
				return
			}
			if err != nil || len(result.TrackingToken) != 43 || result.Status != "pending_payment" {
				t.Fatalf("%+v/%v", result, err)
			}
			if tc.replay {
				if f.allocated != 0 || len(d.calls) != 0 {
					t.Fatal("replay recalculated or allocated")
				}
				return
			}
			if f.saved.ExpiresAt.Sub(f.saved.PlacedAt) != 30*time.Minute || f.saved.Request.Address.DepartmentName != "Bogotá, D. C." || f.saved.TokenHash == result.TrackingToken || len(f.saved.TokenHash) != 64 || f.allocated != 1 || f.released != 0 || f.committed != 1 {
				t.Fatalf("saved=%+v", f.saved)
			}
		})
	}
}
