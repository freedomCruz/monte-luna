package payments_test

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/freedomCruz/monte-luna/backend/internal/catalog"
	"github.com/freedomCruz/monte-luna/backend/internal/contracttest"
	"github.com/freedomCruz/monte-luna/backend/internal/invoicing"
	"github.com/freedomCruz/monte-luna/backend/internal/orders"
	"github.com/freedomCruz/monte-luna/backend/internal/payments"
	"github.com/freedomCruz/monte-luna/backend/internal/platform"
	"github.com/freedomCruz/monte-luna/backend/internal/shipping"
)

type orderPaymentBridge struct{ module *payments.Module }

func (b orderPaymentBridge) Payment(ctx context.Context, id string) (*orders.GuestPayment, error) {
	p, err := b.module.Payment(ctx, id)
	if p == nil || err != nil {
		return nil, err
	}
	return &orders.GuestPayment{Status: p.Status, Method: p.Method}, nil
}
func (b orderPaymentBridge) InFlight(ctx context.Context, id string) (bool, error) {
	return b.module.InFlight(ctx, id)
}
func TestPaymentOrdersRelayAndDuplicateRefund(t *testing.T) {
	for _, scenario := range []string{"pending", "late stocked", "late exhausted"} {
		t.Run(scenario, func(t *testing.T) {
			db, pool, url := database(t)
			if err := catalog.Migrate(t.Context(), db); err != nil {
				t.Fatal(err)
			}
			if err := shipping.Migrate(t.Context(), db); err != nil {
				t.Fatal(err)
			}
			if err := orders.Migrate(t.Context(), db); err != nil {
				t.Fatal(err)
			}
			if err := payments.Migrate(t.Context(), db); err != nil {
				t.Fatal(err)
			}
			if err := catalog.Seed(t.Context(), db); err != nil {
				t.Fatal(err)
			}
			if err := shipping.Seed(t.Context(), db); err != nil {
				t.Fatal(err)
			}
			var logs bytes.Buffer
			logger := slog.New(slog.NewJSONHandler(&logs, nil))
			cat, err := catalog.New(t.Context(), url, "https://media.test/", logger)
			if err != nil {
				t.Fatal(err)
			}
			defer cat.Close()
			ship, err := shipping.New(t.Context(), url)
			if err != nil {
				t.Fatal(err)
			}
			defer ship.Close()
			tax, err := invoicing.NewDemo()
			if err != nil {
				t.Fatal(err)
			}
			clock := &testClock{time.Date(2026, 10, 16, 18, 0, 0, 0, time.UTC)}
			checkout, err := orders.NewRuntime(t.Context(), url, cat, ship, tax, []byte(strings.Repeat("s", 32)), logger, orders.RuntimeOptions{Clock: clock})
			if err != nil {
				t.Fatal(err)
			}
			defer checkout.Close()
			provider := &fakeProvider{}
			payment, err := payments.New(t.Context(), url, payments.NewOrdersPort(checkout), fixtureConfig(), logger, payments.Options{Clock: clock, Gateway: provider})
			if err != nil {
				t.Fatal(err)
			}
			defer payment.Close()
			checkout.EnablePayments(orderPaymentBridge{payment})
			mux := http.NewServeMux()
			checkout.RegisterRoutes(mux)
			payment.RegisterRoutes(mux)
			orderContract := contracttest.Load(t, "orders.yaml")
			paymentContract := contracttest.Load(t, "payments.yaml")
			variant := scalar[string](t, pool, "SELECT id::text FROM catalog.product_variants WHERE sku='MIRADOR-250-WHOLE_BEAN'")
			body := fmt.Sprintf(`{"items":[{"variant_id":%q,"quantity":1}],"customer":{"email":"buyer@example.test","full_name":"Demo Buyer","phone":null},"shipping_address":{"recipient_name":"Demo Buyer","recipient_phone":"3001234567","municipality_code":"11001","address_line1":"Calle 5 # 12-34","address_line2":null,"postal_code":null,"delivery_notes":null},"fiscal_data":null,"accepts_data_policy":true}`, variant)
			placed := orderContract.Do(t, mux, request("POST", "/api/v1/orders", body, startKey))
			if placed.Code != 201 {
				t.Fatal(placed.Body.String())
			}
			var order struct {
				ID     string `json:"order_id"`
				Number string `json:"order_number"`
				Token  string `json:"tracking_token"`
			}
			if err := json.Unmarshal(placed.Body.Bytes(), &order); err != nil {
				t.Fatal(err)
			}
			startBody := `{"tracking_token":"` + order.Token + `"}`
			refs := make([]string, 0, 2)
			for _, key := range []string{startKey, "0199c4e2-7a1b-7c3d-9e0f-1a2b3c4d5e71"} {
				created := paymentContract.Do(t, mux, request("POST", "/api/v1/payments", startBody, key))
				if created.Code != 201 {
					t.Fatal(created.Body.String())
				}
				var c struct {
					Reference string `json:"reference"`
				}
				if err := json.Unmarshal(created.Body.Bytes(), &c); err != nil {
					t.Fatal(err)
				}
				refs = append(refs, c.Reference)
				clock.now = clock.now.Add(time.Second)
			}
			if scenario != "pending" {
				clock.now = clock.now.Add(2 * time.Hour)
				provider.transaction = payments.Transaction{ID: "provider-" + refs[1], Reference: refs[1], Status: "DECLINED", Amount: scalar[int64](t, pool, "SELECT total_amount FROM orders.orders WHERE id=$1", order.ID), Currency: "COP"}
				if _, err := checkout.RunMaintenance(t.Context()); err != nil {
					t.Fatal(err)
				}
				if scalar[string](t, pool, "SELECT status FROM orders.orders WHERE id=$1", order.ID) != "expired" {
					t.Fatal("late fixture did not expire")
				}
				if scenario == "late exhausted" {
					execute(t, pool, "UPDATE catalog.variant_lot_stock SET quantity=0 WHERE variant_id=$1", variant)
				}
			}
			// The first attempt is still created; approve it through the private verifier.
			amount := scalar[int64](t, pool, "SELECT total_amount FROM orders.orders WHERE id=$1", order.ID)
			method := "NEQUI"
			provider.transaction = payments.Transaction{ID: "provider-" + refs[0], Reference: refs[0], Status: "APPROVED", Amount: amount, Currency: "COP", Method: &method}
			verifyBody := fmt.Sprintf(`{"tracking_token":%q,"transaction_id":%q}`, order.Token, provider.transaction.ID)
			approved := paymentContract.Do(t, mux, request("POST", "/api/v1/payments/verify", verifyBody, ""))
			if approved.Code != 200 {
				t.Fatal(approved.Body.String())
			}
			relay, err := platform.NewRelay(pool, []string{"catalog", "orders", "payments"}, platform.DefaultRelayConfig(), logger)
			if err != nil {
				t.Fatal(err)
			}
			relay.Subscribe("payments.payment_approved", checkout.HandlePaymentApproved)
			relay.Subscribe("orders.order_cancelled", payment.HandleOrderCancelled)
			beforeHistory := scalar[int](t, pool, "SELECT count(*) FROM orders.order_status_history")
			originalStatus := scalar[string](t, pool, "SELECT status FROM orders.orders WHERE id=$1", order.ID)
			execute(t, pool, `ALTER TABLE orders.outbox ADD CONSTRAINT fixture_reject_confirmation CHECK(type NOT IN ('orders.order_paid','orders.order_cancelled')) NOT VALID`)
			if _, err := relay.Poll(t.Context(), clock.now.Add(time.Minute)); err != nil {
				t.Fatal(err)
			}
			if scalar[int](t, pool, "SELECT count(*) FROM orders.processed_events") != 0 || scalar[int](t, pool, "SELECT count(*) FROM orders.order_status_history") != beforeHistory || scalar[string](t, pool, "SELECT status FROM orders.orders WHERE id=$1", order.ID) != originalStatus {
				t.Fatal("failed consumer did not roll back order/guard/history")
			}
			execute(t, pool, "ALTER TABLE orders.outbox DROP CONSTRAINT fixture_reject_confirmation")
			for range 3 {
				if _, err := relay.Poll(t.Context(), clock.now.Add(time.Minute+2*time.Second)); err != nil {
					t.Fatal(err)
				}
			}
			want := "paid"
			if scenario == "late exhausted" {
				want = "cancelled"
			}
			if scalar[string](t, pool, "SELECT status FROM orders.orders WHERE id=$1", order.ID) != want {
				t.Fatal("approval did not resolve order")
			}
			if want == "paid" {
				if !scalar[bool](t, pool, "SELECT paid_at IS NOT NULL FROM orders.orders WHERE id=$1", order.ID) || scalar[int](t, pool, "SELECT count(*) FROM orders.outbox WHERE type='orders.order_paid'") != 1 {
					t.Fatal("missing paid timestamp/event")
				}
			} else {
				if scalar[int](t, pool, "SELECT count(*) FROM payments.refunds WHERE reason='late_payment_no_stock' AND method='manual' AND status='pending' AND amount=$1", amount) != 1 || !strings.Contains(logs.String(), order.Number) {
					t.Fatal("missing late-payment refund/error log")
				}
			}
			// Same source approval is harmless after redelivery (including failed relay commit).
			eventID := scalar[string](t, pool, "SELECT id::text FROM payments.outbox WHERE type='payments.payment_approved'")
			payload := scalar[string](t, pool, "SELECT payload::text FROM payments.outbox WHERE id=$1", eventID)
			history := scalar[int](t, pool, "SELECT count(*) FROM orders.order_status_history")
			if err := checkout.HandlePaymentApproved(t.Context(), platform.Event{ID: eventID, Payload: []byte(payload)}); err != nil {
				t.Fatal(err)
			}
			if scalar[int](t, pool, "SELECT count(*) FROM orders.order_status_history") != history {
				t.Fatal("approval redelivery duplicated history")
			}
			if scenario == "pending" {
				// A later provider approval is captured as duplicate_approved, never an order event.
				otherMethod := "CARD"
				provider.transaction = payments.Transaction{ID: "provider-" + refs[1], Reference: refs[1], Status: "APPROVED", Amount: amount, Currency: "COP", Method: &otherMethod}
				verifyBody = fmt.Sprintf(`{"tracking_token":%q,"transaction_id":%q}`, order.Token, provider.transaction.ID)
				second := paymentContract.Do(t, mux, request("POST", "/api/v1/payments/verify", verifyBody, ""))
				if second.Code != 200 {
					t.Fatal(second.Body.String())
				}
				if scalar[int](t, pool, "SELECT count(*) FROM payments.payment_attempts WHERE status='approved'") != 1 || scalar[int](t, pool, "SELECT count(*) FROM payments.payment_attempts WHERE status='duplicate_approved'") != 1 || scalar[int](t, pool, "SELECT count(*) FROM payments.refunds WHERE reason='duplicate_payment' AND method='manual' AND status='pending'") != 1 || scalar[int](t, pool, "SELECT count(*) FROM payments.outbox WHERE type='payments.payment_approved'") != 1 {
					t.Fatal("duplicate approval handling incorrect")
				}
				tracked := orderContract.Do(t, mux, request("GET", "/api/v1/orders/track?token="+order.Token, "", ""))
				if tracked.Code != 200 || !strings.Contains(tracked.Body.String(), `"latest_attempt_status":"approved"`) || !strings.Contains(tracked.Body.String(), `"payment_method_type":"nequi"`) {
					t.Fatal("guest projection did not prefer approved attempt")
				}
				if strings.Count(logs.String(), `"level":"ERROR"`) != 1 || !strings.Contains(logs.String(), order.Number) || !strings.Contains(logs.String(), fmt.Sprint(amount)) {
					t.Fatal("duplicate payment error log missing or repeated")
				}
				cancelPayload, _ := json.Marshal(map[string]any{"order_id": order.ID, "order_number": order.Number, "reason": "customer_request"})
				event := platform.Event{ID: "0199c4e2-7a1b-7c3d-9e0f-1a2b3c4d5e79", Payload: cancelPayload}
				for range 2 {
					if err := payment.HandleOrderCancelled(t.Context(), event); err != nil {
						t.Fatal(err)
					}
				}
				if scalar[int](t, pool, "SELECT count(*) FROM payments.refunds WHERE reason='customer_request'") != 1 || strings.Count(logs.String(), `"level":"ERROR"`) != 2 {
					t.Fatal("cancellation refund or error log duplicated")
				}
			}
		})
	}
}
