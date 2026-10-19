package orders_test

import (
	"context"
	"errors"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/freedomCruz/monte-luna/backend/internal/orders"
)

type inFlightPayments struct {
	pending bool
	err     error
	calls   int
}

func (p *inFlightPayments) Payment(context.Context, string) (*orders.GuestPayment, error) {
	return nil, nil
}
func (p *inFlightPayments) InFlight(context.Context, string) (bool, error) {
	p.calls++
	return p.pending, p.err
}
func TestInFlightGraceCeilingAndFailedLookupPreserveReservation(t *testing.T) {
	clock := &testClock{now: time.Date(2026, 10, 16, 18, 0, 0, 0, time.UTC)}
	placedAt := clock.now
	db, module, mux, contract := orderStorefront(t, clock, nil)
	id := scalar[string](t, db, `SELECT id FROM catalog.product_variants WHERE sku='MIRADOR-250-WHOLE_BEAN'`)
	stock := scalar[int64](t, db, `SELECT sum(quantity) FROM catalog.variant_lot_stock WHERE variant_id=$1`, id)
	placed := callPlacement(t, mux, contract, placeBody(id, 1), key, false)
	if placed.Code != 201 {
		t.Fatal(placed.Body.String())
	}
	port := &inFlightPayments{pending: true}
	module.EnablePayments(port)
	history := scalar[int](t, db, "SELECT count(*) FROM orders.order_status_history")
	events := scalar[int](t, db, "SELECT count(*) FROM orders.outbox")
	clock.now = placedAt.Add(30 * time.Minute)
	port.err = errors.New("provider unavailable")
	before := placementSnapshot(t, db)
	if _, err := module.RunMaintenance(t.Context()); err == nil {
		t.Fatal("provider failure ignored")
	}
	if placementSnapshot(t, db) != before {
		t.Fatal("failed lookup changed order")
	}
	port.err = nil
	for _, minutes := range []time.Duration{30, 45, 60, 75, 90, 105} {
		clock.now = placedAt.Add(minutes * time.Minute)
		if _, err := module.RunMaintenance(t.Context()); err != nil {
			t.Fatal(err)
		}
		if scalar[string](t, db, "SELECT status FROM orders.orders") != "pending_payment" || !scalar[time.Time](t, db, "SELECT reservation_expires_at FROM orders.orders").Equal(placedAt.Add((minutes+15)*time.Minute)) {
			t.Fatal("pending payment hold not extended in 15-minute steps")
		}
		if scalar[int](t, db, "SELECT count(*) FROM orders.order_status_history") != history || scalar[int](t, db, "SELECT count(*) FROM orders.outbox") != events || scalar[int64](t, db, `SELECT sum(quantity) FROM catalog.variant_lot_stock WHERE variant_id=$1`, id) != stock-1 {
			t.Fatal("grace wrote status history/event or released stock")
		}
	}
	calls := port.calls
	clock.now = placedAt.Add(2 * time.Hour)
	if _, err := module.RunMaintenance(t.Context()); err != nil {
		t.Fatal(err)
	}
	if port.calls != calls || scalar[string](t, db, "SELECT status FROM orders.orders") != "expired" || scalar[int64](t, db, `SELECT sum(quantity) FROM catalog.variant_lot_stock WHERE variant_id=$1`, id) != stock || scalar[int](t, db, "SELECT count(*) FROM orders.outbox WHERE type='orders.order_expired'") != 1 {
		t.Fatal("hard ceiling did not expire/release unchanged")
	}
	token := decode(t, placed)["tracking_token"].(string)
	tracked := contract.Do(t, mux, httptest.NewRequest("GET", "/api/v1/orders/track?token="+token, nil))
	if tracked.Code != 200 {
		t.Fatal(tracked.Body.String())
	}
}
