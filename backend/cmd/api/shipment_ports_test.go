package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"sync"
	"testing"
	"time"

	"github.com/freedomCruz/monte-luna/backend/internal/orders"
	"github.com/freedomCruz/monte-luna/backend/internal/shipping"
)

func TestShipmentOrdersPort(t *testing.T) {
	ctx, cancel := context.WithTimeout(t.Context(), 2*time.Minute)
	defer cancel()
	db, url := setupTestDB(ctx, t)
	if err := orders.Migrate(ctx, db); err != nil {
		t.Fatal(err)
	}
	if err := shipping.Migrate(ctx, db); err != nil {
		t.Fatal(err)
	}
	var id string
	if err := db.QueryRowContext(ctx, `INSERT INTO orders.orders(order_number,status,subtotal_amount,shipping_amount,tax_amount,total_amount,shipping_rate_name,shipping_estimated_days_min,shipping_estimated_days_max,customer_email,customer_name,fiscal_profile_snapshot,tracking_token_hash,reservation_expires_at) VALUES('ORD-7K2M9Q4X','paid',100,0,0,100,'Standard',3,5,'buyer@example.com','Buyer','{}','test-hash',now()) RETURNING id`).Scan(&id); err != nil {
		t.Fatal(err)
	}
	checkout, err := orders.NewRuntime(ctx, url, nil, nil, nil, bytes.Repeat([]byte{1}, 32), nil, orders.RuntimeOptions{})
	if err != nil {
		t.Fatal(err)
	}
	defer checkout.Close()
	ship, err := shipping.New(ctx, url)
	if err != nil {
		t.Fatal(err)
	}
	defer ship.Close()
	if err := ship.EnableFulfillment(shipmentOrders{checkout}, time.Now); err != nil {
		t.Fatal(err)
	}
	in := shipping.DispatchInput{OrderID: id, ActorID: "01946894-3d9a-7c98-b807-6c84c1762c30", OrderVersion: 1, CarrierName: "Carrier"}
	for _, tt := range []struct {
		status  string
		version int32
		want    error
	}{
		{"paid", 2, shipping.ErrVersionConflict}, {"cancelled", 1, shipping.ErrInvalidTransition}, {"pending_payment", 1, shipping.ErrInvalidTransition},
	} {
		if _, err := db.ExecContext(ctx, `UPDATE orders.orders SET status=$2 WHERE id=$1`, id, tt.status); err != nil {
			t.Fatal(err)
		}
		in.OrderVersion = tt.version
		_, err := ship.Dispatch(ctx, in)
		if !errors.Is(err, tt.want) {
			t.Fatalf("status=%s err=%v", tt.status, err)
		}
		var n int
		if err := db.QueryRowContext(ctx, `SELECT (SELECT count(*) FROM shipping.shipments)+(SELECT count(*) FROM shipping.outbox)+(SELECT count(*) FROM orders.order_status_history)+(SELECT count(*) FROM orders.outbox)`).Scan(&n); err != nil || n != 0 {
			t.Fatalf("rejection persisted state: %d/%v", n, err)
		}
	}
	if _, err := db.ExecContext(ctx, `UPDATE orders.orders SET status='preparing' WHERE id=$1`, id); err != nil {
		t.Fatal(err)
	}
	in.OrderVersion = 1
	// Concurrent identical dispatches serialize at the public order port; one wins.
	start := make(chan struct{})
	results := make(chan error, 2)
	var wg sync.WaitGroup
	for range 2 {
		wg.Go(func() { <-start; _, err := ship.Dispatch(ctx, in); results <- err })
	}
	close(start)
	wg.Wait()
	close(results)
	successes, conflicts := 0, 0
	for err := range results {
		if err == nil {
			successes++
		} else if errors.Is(err, shipping.ErrVersionConflict) {
			conflicts++
		} else {
			t.Fatal(err)
		}
	}
	if successes != 1 || conflicts != 1 {
		t.Fatalf("successes=%d conflicts=%d", successes, conflicts)
	}
	var events, version, history int
	var status, payload string
	if err := db.QueryRowContext(ctx, `SELECT count(*) FROM shipping.outbox`).Scan(&events); err != nil {
		t.Fatal(err)
	}
	if err := db.QueryRowContext(ctx, `SELECT status,version FROM orders.orders WHERE id=$1`, id).Scan(&status, &version); err != nil {
		t.Fatal(err)
	}
	if err := db.QueryRowContext(ctx, `SELECT count(*) FROM orders.order_status_history`).Scan(&history); err != nil {
		t.Fatal(err)
	}
	if events != 1 || version != 1 || status != "preparing" || history != 0 {
		t.Fatalf("events=%d order=%s/v%d history=%d", events, status, version, history)
	}
	if err := db.QueryRowContext(ctx, `SELECT payload::text FROM shipping.outbox`).Scan(&payload); err != nil {
		t.Fatal(err)
	}
	var body map[string]any
	if err := json.Unmarshal([]byte(payload), &body); err != nil {
		t.Fatal(err)
	}
	if body["actor_id"] != in.ActorID || body["order_id"] != id {
		t.Fatalf("payload=%v", body)
	}
}
