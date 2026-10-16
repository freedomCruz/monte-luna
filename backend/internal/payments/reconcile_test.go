package payments_test

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/freedomCruz/monte-luna/backend/internal/contracttest"
	"github.com/freedomCruz/monte-luna/backend/internal/payments"
)

func signedEvent(reference, status string, amount int64) (string, string) {
	transaction := map[string]any{"id": "provider-" + reference, "reference": reference, "status": status, "amount_in_cents": amount, "currency": "COP", "payment_method_type": "NEQUI", "status_message": "fixture status"}
	sum := sha256.Sum256([]byte(status + "provider-" + reference + "4500000" + "123fixture-events"))
	checksum := hex.EncodeToString(sum[:])
	body, _ := json.Marshal(map[string]any{"event": "transaction.updated", "data": map[string]any{"transaction": transaction}, "environment": "test", "signature": map[string]any{"properties": []string{"transaction.status", "transaction.id", "transaction.amount_in_cents"}, "checksum": checksum}, "timestamp": 123, "sent_at": "2026-10-16T18:00:00Z"})
	return string(body), checksum
}
func TestWebhookHTTPAtomicityDedupMappingAndTerminalGuard(t *testing.T) {
	db, pool, url := database(t)
	if err := payments.Migrate(t.Context(), db); err != nil {
		t.Fatal(err)
	}
	clock := &testClock{time.Date(2026, 10, 16, 18, 0, 0, 0, time.UTC)}
	reader := &ordersReader{payments.Order{ID: orderID, Status: "pending_payment", Amount: 4500000, Currency: "COP", ExpiresAt: clock.now.Add(time.Minute)}}
	module, err := payments.New(t.Context(), url, reader, fixtureConfig(), slog.New(slog.NewTextHandler(io.Discard, nil)), payments.Options{Clock: clock})
	if err != nil {
		t.Fatal(err)
	}
	defer module.Close()
	mux := http.NewServeMux()
	module.RegisterRoutes(mux)
	contract := contracttest.Load(t, "payments.yaml")
	for _, tt := range []struct {
		status, wantStatus, event string
		terminal                  bool
	}{{"PENDING", "pending", "", false}, {"APPROVED", "approved", "payments.payment_approved", true}, {"DECLINED", "declined", "payments.payment_failed", true}, {"ERROR", "error", "payments.payment_failed", true}, {"VOIDED", "voided", "", true}} {
		t.Run(tt.status, func(t *testing.T) {
			execute(t, pool, "TRUNCATE payments.payment_attempts,payments.refunds,payments.idempotency_keys,payments.outbox,payments.provider_webhook_events,payments.processed_events")
			start := contract.Do(t, mux, request("POST", "/api/v1/payments", `{"tracking_token":"`+trackingToken+`"}`, startKey))
			if start.Code != 201 {
				t.Fatal(start.Body.String())
			}
			var checkout struct {
				Reference string `json:"reference"`
			}
			if err := json.Unmarshal(start.Body.Bytes(), &checkout); err != nil {
				t.Fatal(err)
			}
			body, checksum := signedEvent(checkout.Reference, tt.status, 4500000)
			for _, invalid := range []struct{ name, body, header string }{{"missing", body, ""}, {"tampered", strings.Replace(body, `"amount_in_cents":4500000`, `"amount_in_cents":1`, 1), checksum}, {"mismatch", body, strings.Repeat("0", 64)}} {
				t.Run(invalid.name, func(t *testing.T) {
					before := snapshot(t, pool)
					req := request("POST", "/api/v1/payments/webhooks/wompi", invalid.body, "")
					req.Header.Set("X-Event-Checksum", invalid.header)
					var responseCode int
					if invalid.header == "" {
						responseCode = contract.DoInvalid(t, mux, req).Code
					} else {
						responseCode = contract.Do(t, mux, req).Code
					}
					if responseCode != 401 || snapshot(t, pool) != before {
						t.Fatal("invalid webhook changed data or was not rejected")
					}
				})
			}
			before := snapshot(t, pool)
			execute(t, pool, "ALTER TABLE payments.outbox ADD CONSTRAINT fixture_reject_event CHECK (false) NOT VALID")
			if tt.event != "" {
				req := request("POST", "/api/v1/payments/webhooks/wompi", body, "")
				req.Header.Set("X-Event-Checksum", checksum)
				rec := contract.Do(t, mux, req)
				if rec.Code != 500 || snapshot(t, pool) != before {
					t.Fatal("outbox failure did not roll back attempt and webhook guard")
				}
			}
			execute(t, pool, "ALTER TABLE payments.outbox DROP CONSTRAINT fixture_reject_event")
			req := request("POST", "/api/v1/payments/webhooks/wompi", body, "")
			req.Header.Set("X-Event-Checksum", checksum)
			accepted := contract.Do(t, mux, req)
			if accepted.Code != 200 || accepted.Body.Len() != 0 {
				t.Fatalf("webhook status=%d body=%s", accepted.Code, accepted.Body.String())
			}
			if scalar[int](t, pool, "SELECT count(*) FROM payments.payment_attempts WHERE status=$1 AND payment_method_type='NEQUI' AND status_message='fixture status' AND provider_transaction_id=$2", tt.wantStatus, "provider-"+checkout.Reference) != 1 || scalar[int](t, pool, "SELECT count(*) FROM payments.provider_webhook_events") != 1 {
				t.Fatal("provider data not recorded")
			}
			if scalar[bool](t, pool, "SELECT finalized_at IS NOT NULL FROM payments.payment_attempts") != tt.terminal {
				t.Fatal("incorrect finalized timestamp")
			}
			wantEvents := 0
			if tt.event != "" {
				wantEvents = 1
			}
			if scalar[int](t, pool, "SELECT count(*) FROM payments.outbox") != wantEvents {
				t.Fatal("incorrect outbox count")
			}
			if tt.event != "" && scalar[string](t, pool, "SELECT type FROM payments.outbox") != tt.event {
				t.Fatal("incorrect outbox type")
			}
			saved := snapshot(t, pool)
			duplicate := request("POST", "/api/v1/payments/webhooks/wompi", body, "")
			duplicate.Header.Set("X-Event-Checksum", strings.ToUpper(checksum))
			if rec := contract.Do(t, mux, duplicate); rec.Code != 200 || rec.Body.Len() != 0 || snapshot(t, pool) != saved {
				t.Fatal("duplicate webhook reprocessed")
			}
			if tt.terminal {
				late, key := signedEvent(checkout.Reference, "PENDING", 4500000)
				req := request("POST", "/api/v1/payments/webhooks/wompi", late, "")
				req.Header.Set("X-Event-Checksum", key)
				if rec := contract.Do(t, mux, req); rec.Code != 200 {
					t.Fatal(rec.Body.String())
				}
				if scalar[string](t, pool, "SELECT status FROM payments.payment_attempts") != tt.wantStatus || scalar[int](t, pool, "SELECT count(*) FROM payments.outbox") != wantEvents {
					t.Fatal("terminal attempt moved backwards")
				}
			}
		})
	}
	execute(t, pool, "UPDATE payments.provider_webhook_events SET received_at=$1", clock.now.Add(-31*24*time.Hour))
	if err := module.Cleanup(t.Context(), clock.now); err != nil {
		t.Fatal(err)
	}
	if scalar[int](t, pool, "SELECT count(*) FROM payments.provider_webhook_events") != 0 {
		t.Fatal("webhook retention ignored")
	}
}

type fakeProvider struct {
	transaction payments.Transaction
	calls       int
	err         error
}

func (g *fakeProvider) Fetch(context.Context, string, string) (*payments.Transaction, error) {
	g.calls++
	return &g.transaction, g.err
}
func TestVerifyHTTPDoesNotTrustBrowserHints(t *testing.T) {
	db, pool, url := database(t)
	if err := payments.Migrate(t.Context(), db); err != nil {
		t.Fatal(err)
	}
	clock := &testClock{time.Date(2026, 10, 16, 18, 0, 0, 0, time.UTC)}
	reader := &ordersReader{payments.Order{ID: orderID, Status: "pending_payment", Amount: 4500000, Currency: "COP", ExpiresAt: clock.now.Add(time.Minute)}}
	provider := &fakeProvider{}
	module, err := payments.New(t.Context(), url, reader, fixtureConfig(), slog.Default(), payments.Options{Clock: clock, Gateway: provider})
	if err != nil {
		t.Fatal(err)
	}
	defer module.Close()
	mux := http.NewServeMux()
	module.RegisterRoutes(mux)
	contract := contracttest.Load(t, "payments.yaml")
	start := contract.Do(t, mux, request("POST", "/api/v1/payments", `{"tracking_token":"`+trackingToken+`"}`, startKey))
	var checkout struct {
		Reference string `json:"reference"`
	}
	if err := json.Unmarshal(start.Body.Bytes(), &checkout); err != nil {
		t.Fatal(err)
	}
	before := snapshot(t, pool)
	noID := contract.Do(t, mux, request("POST", "/api/v1/payments/verify", `{"tracking_token":"`+trackingToken+`","transaction_id":null}`, ""))
	if noID.Code != 200 || !strings.Contains(noID.Body.String(), `"latest_attempt_status":"created"`) || provider.calls != 0 || snapshot(t, pool) != before {
		t.Fatal("no-id verification changed data")
	}
	for _, tt := range []struct {
		reference, currency string
		amount              int64
	}{{"other", "COP", 4500000}, {checkout.Reference, "USD", 4500000}, {checkout.Reference, "COP", 1}} {
		provider.transaction = payments.Transaction{ID: "hint", Reference: tt.reference, Currency: tt.currency, Amount: tt.amount, Status: "APPROVED"}
		rec := contract.Do(t, mux, request("POST", "/api/v1/payments/verify", `{"tracking_token":"`+trackingToken+`","transaction_id":"hint"}`, ""))
		if rec.Code != 422 || !strings.Contains(rec.Body.String(), "payment_transaction_mismatch") || snapshot(t, pool) != before {
			t.Fatal("hint mismatch changed data")
		}
	}
	method := "PSE"
	provider.transaction = payments.Transaction{ID: "hint", Reference: checkout.Reference, Currency: "COP", Amount: 4500000, Status: "APPROVED", Method: &method}
	rec := contract.Do(t, mux, request("POST", "/api/v1/payments/verify", `{"tracking_token":"`+trackingToken+`","transaction_id":"hint"}`, ""))
	if rec.Code != 200 || !strings.Contains(rec.Body.String(), `"latest_attempt_status":"approved"`) || !strings.Contains(rec.Body.String(), `"payment_method_type":"pse"`) || scalar[int](t, pool, "SELECT count(*) FROM payments.outbox WHERE type='payments.payment_approved'") != 1 {
		t.Fatal("private lookup did not reconcile payment")
	}
}
