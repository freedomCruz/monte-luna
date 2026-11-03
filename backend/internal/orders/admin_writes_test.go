package orders_test

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/freedomCruz/monte-luna/backend/internal/orders"
	"github.com/freedomCruz/monte-luna/backend/internal/platform"
)

const (
	adminActorOwner = "01946894-3d9a-7c98-b807-6c84c1762c30"
	adminActorStaff = "01946894-3d9a-7c98-b807-6c84c1762c31"
)

// dispatchedShipments reports a committed dispatch for the listed orders.
type dispatchedShipments map[string]bool

func (d dispatchedShipments) Shipment(_ context.Context, id string) (*orders.AdminShipment, error) {
	if !d[id] {
		return nil, nil
	}
	return &orders.AdminShipment{ID: id, OrderID: id, Status: "shipped", Version: 2}, nil
}

func TestAdminOrderWritesAndShipmentConsumer(t *testing.T) {
	clock := &testClock{now: time.Date(2026, 11, 3, 16, 0, 0, 0, time.UTC)}
	db, m, mux, c := orderStorefront(t, clock, nil)
	p := &adminPayments{}
	shipments := dispatchedShipments{}
	if err := m.EnableAdminReads(p, adminImages{}, shipments); err != nil {
		t.Fatal(err)
	}
	access := &orderAdminAccess{role: "owner"}
	passthrough := func(next http.Handler) http.Handler { return next }
	if err := m.RegisterAdminReadRoutes(mux, access, passthrough); err != nil {
		t.Fatal(err)
	}
	if err := m.RegisterAdminWriteRoutes(mux, access, passthrough); err != nil {
		t.Fatal(err)
	}

	variant := scalar[string](t, db, `SELECT id FROM catalog.product_variants WHERE sku='MIRADOR-250-WHOLE_BEAN'`)
	initialStock := scalar[int64](t, db, `SELECT sum(quantity) FROM catalog.variant_lot_stock WHERE variant_id=$1`, variant)

	// Place order
	placed := decode(t, callPlacement(t, mux, c, placeBody(variant, 2), key, false))
	orderID := placed["order_id"].(string)

	// Initial placement sets status to pending_payment, reduces catalog stock by 2
	allocatedStock := scalar[int64](t, db, `SELECT sum(quantity) FROM catalog.variant_lot_stock WHERE variant_id=$1`, variant)
	if allocatedStock != initialStock-2 {
		t.Fatalf("stock after placement = %d, want %d", allocatedStock, initialStock-2)
	}

	// 1. Move to-preparing when order is NOT paid -> 409 invalid_order_transition
	req := httptest.NewRequest("POST", "/api/v1/admin/orders/"+orderID+"/to-preparing", strings.NewReader(`{}`))
	req.Header.Set("If-Match", `"1"`)
	req.Header.Set("Content-Type", "application/json")
	rec := c.Do(t, mux, req)
	if rec.Code != 409 {
		t.Fatalf("prepare pending_payment status=%d, want 409", rec.Code)
	}

	// Make order paid
	execSQL(t, db, `UPDATE orders.orders SET status='paid', paid_at='2026-11-03T16:05:00Z', version=2 WHERE id=$1`, orderID)
	execSQL(t, db, `INSERT INTO orders.order_status_history(order_id, from_status, to_status, actor_type, created_at) VALUES($1, 'pending_payment', 'paid', 'system', '2026-11-03T16:05:00Z')`, orderID)

	// 2. Prepare order with stale If-Match -> 412 version_conflict
	req = httptest.NewRequest("POST", "/api/v1/admin/orders/"+orderID+"/to-preparing", strings.NewReader(`{}`))
	req.Header.Set("If-Match", `"1"`)
	req.Header.Set("Content-Type", "application/json")
	rec = c.Do(t, mux, req)
	if rec.Code != 412 {
		t.Fatalf("prepare with stale If-Match status=%d, want 412", rec.Code)
	}

	// Prepare order with correct If-Match -> 200, status preparing, version incremented
	clock.now = time.Date(2026, 11, 3, 16, 10, 0, 0, time.UTC)
	access.role = "staff"
	req = httptest.NewRequest("POST", "/api/v1/admin/orders/"+orderID+"/to-preparing", strings.NewReader(`{}`))
	req.Header.Set("If-Match", `"2"`)
	req.Header.Set("Content-Type", "application/json")
	rec = c.Do(t, mux, req)
	if rec.Code != 200 {
		t.Fatalf("prepare order status=%d body=%s, want 200", rec.Code, rec.Body.String())
	}
	var prepOrder map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &prepOrder); err != nil {
		t.Fatal(err)
	}
	if prepOrder["status"] != "preparing" || prepOrder["version"] != float64(3) {
		t.Fatalf("prepared order=%+v, want status preparing version 3", prepOrder)
	}

	// Verify history has admin actor
	historyNote := scalar[string](t, db, `SELECT actor_type FROM orders.order_status_history WHERE order_id=$1 AND to_status='preparing'`, orderID)
	if historyNote != "admin" {
		t.Fatalf("history actor_type=%s, want admin", historyNote)
	}

	// 3. Consumer of shipping.shipment_shipped: preparing -> shipped
	shipmentEvent := platform.Event{
		ID:         "01946894-3d9a-7c98-b807-6c84c1762d01",
		Type:       "shipping.shipment_shipped",
		OccurredAt: time.Date(2026, 11, 3, 16, 20, 0, 0, time.UTC),
		Payload: []byte(`{
			"shipment_id": "01946894-3d9a-7c98-b807-6c84c1762c99",
			"order_id": "` + orderID + `",
			"actor_id": "` + adminActorStaff + `",
			"carrier_name": "Coordinadora",
			"tracking_number": "12345678",
			"shipped_at": "2026-11-03T16:20:00Z"
		}`),
	}
	if err := m.HandleShipmentShipped(t.Context(), shipmentEvent); err != nil {
		t.Fatalf("handle shipment shipped err: %v", err)
	}
	currStatus := scalar[string](t, db, `SELECT status FROM orders.orders WHERE id=$1`, orderID)
	currVersion := scalar[int32](t, db, `SELECT version FROM orders.orders WHERE id=$1`, orderID)
	if currStatus != "shipped" || currVersion != 4 {
		t.Fatalf("order status=%s version=%d, want shipped / 4", currStatus, currVersion)
	}
	// Verify idempotent replay of shipment_shipped does not error or re-increment
	if err := m.HandleShipmentShipped(t.Context(), shipmentEvent); err != nil {
		t.Fatalf("idempotent shipment shipped replay err: %v", err)
	}
	if scalar[string](t, db, `SELECT status FROM orders.orders WHERE id=$1`, orderID) != "shipped" || scalar[int32](t, db, `SELECT version FROM orders.orders WHERE id=$1`, orderID) != 4 {
		t.Fatal("replayed shipment_shipped mutated order")
	}

	// 4. Mark delivered: shipped -> delivered, publishes orders.order_delivered
	clock.now = time.Date(2026, 11, 4, 10, 0, 0, 0, time.UTC)
	access.role = "owner"
	req = httptest.NewRequest("POST", "/api/v1/admin/orders/"+orderID+"/deliver", strings.NewReader(`{}`))
	req.Header.Set("If-Match", `"4"`)
	req.Header.Set("Content-Type", "application/json")
	rec = c.Do(t, mux, req)
	if rec.Code != 200 {
		t.Fatalf("deliver order status=%d body=%s, want 200", rec.Code, rec.Body.String())
	}
	if scalar[string](t, db, `SELECT status FROM orders.orders WHERE id=$1`, orderID) != "delivered" || scalar[int32](t, db, `SELECT version FROM orders.orders WHERE id=$1`, orderID) != 5 {
		t.Fatal("order was not marked delivered with version 5")
	}
	delivEvtCount := scalar[int](t, db, `SELECT count(*) FROM orders.outbox WHERE type='orders.order_delivered'`)
	if delivEvtCount != 1 {
		t.Fatalf("orders.order_delivered outbox count=%d, want 1", delivEvtCount)
	}

	// Cannot cancel or re-deliver a delivered order (terminal)
	req = httptest.NewRequest("POST", "/api/v1/admin/orders/"+orderID+"/cancel", strings.NewReader(`{"reason":"too late"}`))
	req.Header.Set("If-Match", `"5"`)
	req.Header.Set("Content-Type", "application/json")
	rec = c.Do(t, mux, req)
	if rec.Code != 409 {
		t.Fatalf("cancel delivered order status=%d, want 409", rec.Code)
	}

	// 5. Test auto-preparation from paid when shipment_shipped arrives (S5 requirement: paid -> preparing -> shipped in same transaction)
	placed2 := decode(t, callPlacement(t, mux, c, placeBody(variant, 1), "0199c4e2-7a1b-7c3d-9e0f-1a2b3c4d5e6a", false))
	orderID2 := placed2["order_id"].(string)
	execSQL(t, db, `UPDATE orders.orders SET status='paid', paid_at='2026-11-03T16:30:00Z', version=2 WHERE id=$1`, orderID2)
	execSQL(t, db, `INSERT INTO orders.order_status_history(order_id, from_status, to_status, actor_type, created_at) VALUES($1, 'pending_payment', 'paid', 'system', '2026-11-03T16:30:00Z')`, orderID2)

	shipmentEvent2 := platform.Event{
		ID:         "01946894-3d9a-7c98-b807-6c84c1762d02",
		Type:       "shipping.shipment_shipped",
		OccurredAt: time.Date(2026, 11, 3, 16, 35, 0, 0, time.UTC),
		Payload: []byte(`{
			"shipment_id": "01946894-3d9a-7c98-b807-6c84c1762c98",
			"order_id": "` + orderID2 + `",
			"actor_id": "` + adminActorOwner + `",
			"carrier_name": "Servientrega",
			"tracking_number": "999888",
			"shipped_at": "2026-11-03T16:35:00Z"
		}`),
	}
	if err := m.HandleShipmentShipped(t.Context(), shipmentEvent2); err != nil {
		t.Fatalf("handle shipment shipped for paid order err: %v", err)
	}
	if scalar[string](t, db, `SELECT status FROM orders.orders WHERE id=$1`, orderID2) != "shipped" {
		t.Fatal("paid order did not reach shipped")
	}
	// Verify history has both paid->preparing and preparing->shipped attributed to admin
	historyTransitions := scalar[int](t, db, `SELECT count(*) FROM orders.order_status_history WHERE order_id=$1 AND to_status IN ('preparing','shipped') AND actor_type='admin'`, orderID2)
	if historyTransitions != 2 {
		t.Fatalf("expected 2 admin transitions (preparing, shipped), got %d", historyTransitions)
	}

	// 6. Cancellation test from preparing: releases stock back to catalog and publishes orders.order_cancelled
	placed3 := decode(t, callPlacement(t, mux, c, placeBody(variant, 3), "0199c4e2-7a1b-7c3d-9e0f-1a2b3c4d5e6b", false))
	orderID3 := placed3["order_id"].(string)
	execSQL(t, db, `UPDATE orders.orders SET status='paid', paid_at='2026-11-03T16:40:00Z', version=2 WHERE id=$1`, orderID3)
	execSQL(t, db, `INSERT INTO orders.order_status_history(order_id, from_status, to_status, actor_type, created_at) VALUES($1, 'pending_payment', 'paid', 'system', '2026-11-03T16:40:00Z')`, orderID3)

	stockBeforeCancel := scalar[int64](t, db, `SELECT sum(quantity) FROM catalog.variant_lot_stock WHERE variant_id=$1`, variant)
	outboxBefore := scalar[int](t, db, `SELECT count(*) FROM orders.outbox`)

	// Rejected cancellations change nothing: stale version, then a committed dispatch.
	shipments[orderID3] = true
	for _, tt := range []struct {
		etag string
		code int
	}{{`"1"`, 412}, {`"2"`, 409}} {
		req = httptest.NewRequest("POST", "/api/v1/admin/orders/"+orderID3+"/cancel", strings.NewReader(`{"reason":null}`))
		req.Header.Set("If-Match", tt.etag)
		req.Header.Set("Content-Type", "application/json")
		if rec = c.Do(t, mux, req); rec.Code != tt.code {
			t.Fatalf("rejected cancel If-Match %s status=%d, want %d", tt.etag, rec.Code, tt.code)
		}
		if scalar[int64](t, db, `SELECT sum(quantity) FROM catalog.variant_lot_stock WHERE variant_id=$1`, variant) != stockBeforeCancel ||
			scalar[int](t, db, `SELECT count(*) FROM orders.outbox`) != outboxBefore ||
			scalar[string](t, db, `SELECT status FROM orders.orders WHERE id=$1`, orderID3) != "paid" {
			t.Fatalf("rejected cancel (%d) changed stock, outbox or status", tt.code)
		}
	}
	shipments[orderID3] = false

	req = httptest.NewRequest("POST", "/api/v1/admin/orders/"+orderID3+"/cancel", strings.NewReader(`{"reason":"  Customer requested cancellation before dispatch  "}`))
	req.Header.Set("If-Match", `"2"`)
	req.Header.Set("Content-Type", "application/json")
	rec = c.Do(t, mux, req)
	if rec.Code != 200 {
		t.Fatalf("cancel order status=%d body=%s, want 200", rec.Code, rec.Body.String())
	}
	if scalar[string](t, db, `SELECT status FROM orders.orders WHERE id=$1`, orderID3) != "cancelled" || scalar[int32](t, db, `SELECT version FROM orders.orders WHERE id=$1`, orderID3) != 3 {
		t.Fatal("cancelled order status or version mismatch")
	}
	// Verify stock was released back to lots
	stockAfterCancel := scalar[int64](t, db, `SELECT sum(quantity) FROM catalog.variant_lot_stock WHERE variant_id=$1`, variant)
	if stockAfterCancel != stockBeforeCancel+3 {
		t.Fatalf("stock after cancel = %d, want %d", stockAfterCancel, stockBeforeCancel+3)
	}
	// Verify outbox published orders.order_cancelled
	cancelEvt := scalar[int](t, db, `SELECT count(*) FROM orders.outbox WHERE type='orders.order_cancelled' AND payload->>'order_id'=$1`, orderID3)
	if cancelEvt != 1 {
		t.Fatalf("orders.order_cancelled outbox count=%d, want 1", cancelEvt)
	}
	// Verify note in history contains trimmed reason
	historyReason := scalar[string](t, db, `SELECT note FROM orders.order_status_history WHERE order_id=$1 AND to_status='cancelled'`, orderID3)
	if historyReason != "Customer requested cancellation before dispatch" {
		t.Fatalf("history note=%s, want trimmed reason", historyReason)
	}
}
