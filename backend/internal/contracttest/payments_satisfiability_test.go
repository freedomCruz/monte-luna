package contracttest_test

import (
	"encoding/json"
	"strings"
	"testing"

	"github.com/freedomCruz/monte-luna/backend/internal/contracttest"
	"github.com/getkin/kin-openapi/openapi3"
)

func TestPaymentsSchemasSatisfiability(t *testing.T) {
	payments := contracttest.Load(t, "payments.yaml")
	orders := contracttest.Load(t, "orders.yaml")
	tests := []struct {
		name, schema, body string
		orders, invalid    bool
	}{
		{name: "missing token rejected", schema: "StartPaymentRequest", body: `{}`, invalid: true},
		{name: "malformed token rejected", schema: "StartPaymentRequest", body: `{"tracking_token":"order-number"}`, invalid: true},
		{name: "start token only", schema: "StartPaymentRequest", body: `{"tracking_token":"` + strings.Repeat("a", 43) + `"}`},
		{name: "client cannot choose amount", schema: "StartPaymentRequest", body: `{"tracking_token":"` + strings.Repeat("a", 43) + `","amount_in_cents":1}`, invalid: true},
		{name: "widget parameters", schema: "PaymentCheckout", body: `{"public_key":"pub_test_placeholder","currency":"COP","amount_in_cents":4500000,"reference":"attempt-reference","integrity_signature":"` + strings.Repeat("a", 64) + `","expires_at":"2026-10-16T15:30:00Z","redirect_url":"https://store.example/pedido?token=placeholder"}`},
		{name: "response cannot contain private key", schema: "PaymentCheckout", body: `{"public_key":"pub_test_placeholder","private_key":"forbidden-placeholder","currency":"COP","amount_in_cents":4500000,"reference":"attempt-reference","integrity_signature":"` + strings.Repeat("a", 64) + `","expires_at":"2026-10-16T15:30:00Z","redirect_url":"https://store.example/pedido?token=placeholder"}`, invalid: true},
		{name: "missing signature", schema: "PaymentCheckout", body: `{"public_key":"pub_test_placeholder","currency":"COP","amount_in_cents":4500000,"reference":"attempt-reference","expires_at":"2026-10-16T15:30:00Z","redirect_url":"https://store.example/pedido?token=placeholder"}`, invalid: true},
		{name: "verify unknown provider id", schema: "VerifyPaymentRequest", body: `{"tracking_token":"` + strings.Repeat("a", 43) + `","transaction_id":null}`},
		{name: "verify redirect hint", schema: "VerifyPaymentRequest", body: `{"tracking_token":"` + strings.Repeat("a", 43) + `","transaction_id":"1234-1610641025-49201"}`},
		{name: "redirect status not trusted", schema: "VerifyPaymentRequest", body: `{"tracking_token":"` + strings.Repeat("a", 43) + `","transaction_id":null,"status":"APPROVED"}`, invalid: true},
		{name: "new attempt", schema: "PaymentVerification", body: `{"payment":{"latest_attempt_status":"created","payment_method_type":null}}`},
		{name: "voided", schema: "GuestPayment", orders: true, body: `{"latest_attempt_status":"voided","payment_method_type":"card"}`},
		{name: "expired", schema: "GuestPayment", orders: true, body: `{"latest_attempt_status":"expired","payment_method_type":null}`},
		{name: "bancolombia transfer", schema: "GuestPayment", orders: true, body: `{"latest_attempt_status":"approved","payment_method_type":"bancolombia_transfer"}`},
		{name: "no attempts", schema: "PaymentVerification", body: `{"payment":null}`},
		{name: "pending verification", schema: "PaymentVerification", body: `{"payment":{"latest_attempt_status":"pending","payment_method_type":"pse"}}`},
		{name: "paid with nequi", schema: "GuestPayment", orders: true, body: `{"latest_attempt_status":"approved","payment_method_type":"nequi"}`},
		{name: "declined", schema: "GuestPayment", orders: true, body: `{"latest_attempt_status":"declined","payment_method_type":"card"}`},
		{name: "technical error before method known", schema: "GuestPayment", orders: true, body: `{"latest_attempt_status":"error","payment_method_type":null}`},
		{name: "missing method rejected", schema: "GuestPayment", orders: true, body: `{"latest_attempt_status":"pending"}`, invalid: true},
		{name: "provider event with extra signed property", schema: "WompiEvent", body: `{"event":"transaction.updated","data":{"transaction":{"id":"1234-1610641025-49201","reference":"attempt-reference","amount_in_cents":4500000,"currency":"COP","status":"APPROVED","payment_method_type":"NEQUI","extra_signed_value":"preserved"}},"environment":"test","signature":{"properties":["transaction.extra_signed_value","transaction.id"],"checksum":"` + strings.Repeat("A", 64) + `"},"timestamp":1792162800,"sent_at":"2026-10-16T15:00:00Z"}`},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			contract := payments
			if tt.orders {
				contract = orders
			}
			schema := contract.Doc().Components.Schemas[tt.schema]
			if schema == nil {
				t.Fatalf("schema %s not found", tt.schema)
			}
			var body any
			if err := json.Unmarshal([]byte(tt.body), &body); err != nil {
				t.Fatal(err)
			}
			err := schema.Value.VisitJSON(body, openapi3.MultiErrors())
			if (err != nil) != tt.invalid {
				t.Fatalf("invalid=%v, validation error=%v", tt.invalid, err)
			}
		})
	}
}

func TestGuestOrderPaymentSatisfiability(t *testing.T) {
	contract := contracttest.Load(t, "orders.yaml")
	// The existing order representation remains intact; only payment is added.
	const order = `{
		"order_number":"ORD-7K2M9Q4X","status":"pending_payment",
		"placed_at":"2026-10-16T15:00:00Z","reservation_expires_at":"2026-10-16T15:30:00Z",
		"lines":[],"shipping":{"rate_name":"Standard","shipping_amount":0,
		"is_free_shipping":true,"estimated_days_min":3,"estimated_days_max":5},
		"subtotal_amount":4500000,"shipping_amount":0,"tax_amount":0,"total_amount":4500000,
		"shipping_address":{"recipient_name":"Test Buyer","recipient_phone":"3001234567",
		"municipality_code":"11001","municipality_name":"Bogota","department_name":"Bogota",
		"address_line1":"Test street 123","address_line2":null,"delivery_notes":null},"shipment":null
	}`
	tests := []struct {
		name, status, payment string
	}{
		{"no attempt", "pending_payment", `null`},
		{"confirming", "pending_payment", `{"latest_attempt_status":"pending","payment_method_type":"pse"}`},
		{"approved awaiting order consumer", "pending_payment", `{"latest_attempt_status":"approved","payment_method_type":"nequi"}`},
		{"paid", "paid", `{"latest_attempt_status":"approved","payment_method_type":"nequi"}`},
		{"rejected", "pending_payment", `{"latest_attempt_status":"declined","payment_method_type":"card"}`},
		{"error", "pending_payment", `{"latest_attempt_status":"error","payment_method_type":null}`},
		{"expired", "expired", `{"latest_attempt_status":"expired","payment_method_type":null}`},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var body map[string]any
			if err := json.Unmarshal([]byte(order), &body); err != nil {
				t.Fatal(err)
			}
			var payment any
			if err := json.Unmarshal([]byte(tt.payment), &payment); err != nil {
				t.Fatal(err)
			}
			body["status"] = tt.status
			body["payment"] = payment
			schema := contract.Doc().Components.Schemas["GuestOrder"].Value
			if err := schema.VisitJSON(body, openapi3.MultiErrors()); err != nil {
				t.Fatalf("GuestOrder with payment is unsatisfiable: %v", err)
			}
			delete(body, "payment")
			if err := schema.VisitJSON(body); err == nil {
				t.Fatal("payment must be explicit, including null when no attempt exists")
			}
		})
	}

	t.Run("PlacedOrder unchanged", func(t *testing.T) {
		var body any
		if err := json.Unmarshal([]byte(`{"order_id":"01946894-3d9a-7c98-b807-6c84c1762c2f","order_number":"ORD-7K2M9Q4X","status":"pending_payment","total_amount":4500000,"reservation_expires_at":"2026-10-16T15:30:00Z","tracking_token":"`+strings.Repeat("a", 43)+`"}`), &body); err != nil {
			t.Fatal(err)
		}
		if err := contract.Doc().Components.Schemas["PlacedOrder"].Value.VisitJSON(body); err != nil {
			t.Fatalf("existing PlacedOrder no longer validates: %v", err)
		}
	})
}
