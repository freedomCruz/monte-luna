package orders_test

import (
	"testing"
	"time"
)

func TestInventoryPublicPortWithPlacedOrder(t *testing.T) {
	clock := &testClock{now: time.Date(2026, 11, 3, 15, 0, 0, 0, time.UTC)}
	db, m, mux, c := orderStorefront(t, clock, nil)
	variant := scalar[string](t, db, `SELECT id FROM catalog.product_variants WHERE sku='MIRADOR-250-WHOLE_BEAN'`)
	placed := decode(t, callPlacement(t, mux, c, placeBody(variant, 2), key, false))
	id := placed["order_id"].(string)
	held, err := m.HeldInventory(t.Context(), []string{variant})
	if err != nil {
		t.Fatal(err)
	}
	var total int64
	for _, v := range held {
		if v.VariantID != variant || v.LotID == "" {
			t.Fatalf("allocation %+v", v)
		}
		total += v.Quantity
	}
	if total != 2 {
		t.Fatalf("held %d", total)
	}
	for _, tt := range []struct {
		status, state string
		count         int
	}{{"pending_payment", "held", 1}, {"paid", "committed", 0}, {"preparing", "committed", 0}, {"shipped", "committed", 0}, {"delivered", "committed", 0}, {"cancelled", "released", 0}, {"expired", "released", 0}} {
		execSQL(t, db, `UPDATE orders.orders SET status=$2 WHERE id=$1`, id, tt.status)
		values, err := m.InventoryOrders(t.Context(), []string{id, "01946894-3d9a-7c98-b807-6c84c1762c39"})
		if err != nil || len(values) != 1 || values[id].ReservationState != tt.state || values[id].Status != tt.status || values[id].OrderNumber == "" {
			t.Fatalf("projection %+v %v", values, err)
		}
		quantities, err := m.HeldInventory(t.Context(), []string{variant})
		if err != nil {
			t.Fatal(err)
		}
		if (len(quantities) > 0) != (tt.count > 0) {
			t.Fatalf("%s held %+v", tt.status, quantities)
		}
	}
}
