package main

import (
	"bytes"
	"context"
	"database/sql"
	"testing"
	"time"

	"github.com/freedomCruz/monte-luna/backend/internal/catalog"
	"github.com/freedomCruz/monte-luna/backend/internal/orders"
	"github.com/freedomCruz/monte-luna/backend/internal/payments"
	"github.com/freedomCruz/monte-luna/backend/internal/shipping"
)

func TestAdminOrderProducerComposition(t *testing.T) {
	ctx, cancel := context.WithTimeout(t.Context(), 2*time.Minute)
	defer cancel()
	db, url := setupTestDB(ctx, t)
	for _, migrate := range []func(context.Context, *sql.DB) error{catalog.Migrate, orders.Migrate, payments.Migrate, shipping.Migrate} {
		if err := migrate(ctx, db); err != nil {
			t.Fatal(err)
		}
	}
	var id string
	if err := db.QueryRowContext(ctx, `INSERT INTO orders.orders(order_number,status,subtotal_amount,shipping_amount,tax_amount,total_amount,shipping_rate_name,shipping_estimated_days_min,shipping_estimated_days_max,customer_email,customer_name,fiscal_profile_snapshot,tracking_token_hash,reservation_expires_at) VALUES('ORD-7K2M9Q4X','paid',100,0,0,100,'Standard',3,5,'buyer@example.com','Buyer','{}','hash',now()) RETURNING id`).Scan(&id); err != nil {
		t.Fatal(err)
	}
	if _, err := db.ExecContext(ctx, `INSERT INTO orders.order_shipping_addresses(order_id,recipient_name,phone,address_line1,department_name,municipality_code,municipality_name) VALUES($1,'Buyer','3001234567','Street 123','Bogota','11001','Bogota');`, id); err != nil {
		t.Fatal(err)
	}
	if _, err := db.ExecContext(ctx, `INSERT INTO payments.payment_attempts(order_id,reference,status,amount,currency,expires_at,payment_method_type) VALUES($1,'payment-ref','approved',100,'COP',now(),'NEQUI')`, id); err != nil {
		t.Fatal(err)
	}
	checkout, err := orders.NewRuntime(ctx, url, nil, nil, nil, bytes.Repeat([]byte{1}, 32), nil, orders.RuntimeOptions{})
	if err != nil {
		t.Fatal(err)
	}
	defer checkout.Close()
	pay, err := payments.New(ctx, url, payments.NewOrdersPort(checkout), payments.Config{PublicKey: "pub_test_fixture", PrivateKey: "prv_test_fixture", IntegritySecret: "integrity", EventsSecret: "events", Environment: "sandbox", StorefrontBaseURL: "https://store.test", HTTPTimeout: time.Second}, nil, payments.Options{})
	if err != nil {
		t.Fatal(err)
	}
	defer pay.Close()
	cat, err := catalog.New(ctx, url, "https://media.example/", nil)
	if err != nil {
		t.Fatal(err)
	}
	defer cat.Close()
	ship, err := shipping.New(ctx, url)
	if err != nil {
		t.Fatal(err)
	}
	defer ship.Close()
	if err := checkout.EnableAdminReads(adminOrderPayments{pay}, cat, adminOrderShipments{ship}); err != nil {
		t.Fatal(err)
	}
	got, err := checkout.AdminOrder(ctx, id)
	if err != nil || got.Payment == nil || got.Payment.Method == nil || *got.Payment.Method != "nequi" || len(got.Attempts) != 1 || got.Attempts[0].Reference != "payment-ref" || got.Shipment != nil {
		t.Fatalf("detail=%+v err=%v", got, err)
	}
	if got.Summary.Shipping.ZoneName != nil || got.Summary.Shipping.MinWeightGrams != nil {
		t.Fatal("historical shipping values were invented")
	}
	var rows int
	if err := db.QueryRowContext(ctx, `SELECT (SELECT count(*) FROM orders.outbox)+(SELECT count(*) FROM shipping.outbox)+(SELECT count(*) FROM payments.outbox)+(SELECT count(*) FROM orders.order_status_history)`).Scan(&rows); err != nil || rows != 0 {
		t.Fatalf("reads produced effects=%d err=%v", rows, err)
	}
}
