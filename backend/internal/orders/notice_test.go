package orders_test

import (
	"testing"
	"time"
)

func TestOrderNoticeForCustomerEmails(t *testing.T) {
	clock := &testClock{now: time.Date(2026, 11, 3, 16, 0, 0, 0, time.UTC)}
	db, m, mux, c := orderStorefront(t, clock, nil)
	variant := scalar[string](t, db, `SELECT id FROM catalog.product_variants WHERE sku='MIRADOR-250-WHOLE_BEAN'`)
	orderID := decode(t, callPlacement(t, mux, c, placeBody(variant, 1), key, false))["order_id"].(string)
	number := scalar[string](t, db, `SELECT order_number FROM orders.orders WHERE id=$1`, orderID)
	email := scalar[string](t, db, `SELECT customer_email FROM orders.orders WHERE id=$1`, orderID)
	name := scalar[string](t, db, `SELECT customer_name FROM orders.orders WHERE id=$1`, orderID)

	notice, err := m.OrderNotice(t.Context(), orderID)
	if err != nil || notice.OrderNumber != number || notice.Email != email || notice.Name != name || notice.CancelReason != nil {
		t.Fatalf("active order notice=%+v err=%v", notice, err)
	}
	// System cancellation notes are internal and never reach the customer.
	execSQL(t, db, `INSERT INTO orders.order_status_history(order_id,from_status,to_status,actor_type,note,created_at) VALUES($1,'pending_payment','cancelled','system','Payment approved after stock expired.','2026-11-03T16:10:00Z')`, orderID)
	if notice, err = m.OrderNotice(t.Context(), orderID); err != nil || notice.CancelReason != nil {
		t.Fatalf("system cancellation leaked note=%v err=%v", notice.CancelReason, err)
	}
	execSQL(t, db, `INSERT INTO orders.order_status_history(order_id,from_status,to_status,actor_type,actor_id,note,created_at) VALUES($1,'paid','cancelled','admin','01946894-3d9a-7c98-b807-6c84c1762c30','Sin existencias','2026-11-03T16:20:00Z')`, orderID)
	if notice, err = m.OrderNotice(t.Context(), orderID); err != nil || notice.CancelReason == nil || *notice.CancelReason != "Sin existencias" {
		t.Fatalf("admin reason=%v err=%v", notice.CancelReason, err)
	}
	if _, err := m.OrderNotice(t.Context(), "01946894-3d9a-7c98-b807-6c84c1762cff"); err == nil {
		t.Fatal("unknown order returned a notice")
	}
}
