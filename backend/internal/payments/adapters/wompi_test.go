package adapters_test

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/freedomCruz/monte-luna/backend/internal/payments/adapters"
)

func TestWompiPrivateLookupAndUnverifiedReferenceFallback(t *testing.T) {
	for _, tt := range []struct {
		name, id, reference, path, response string
		wantError                           bool
	}{{"id", "provider-id", "REF", "/v1/transactions/provider-id", `{"data":{"id":"provider-id","reference":"REF","amount_in_cents":4500000,"currency":"COP","status":"PENDING","payment_method_type":"PSE"}}`, false}, {"reference", "", "REF", "/v1/transactions?reference=REF", `{"data":[{"id":"provider-id","reference":"REF","amount_in_cents":4500000,"currency":"COP","status":"PENDING","payment_method_type":"PSE"}]}`, false}, {"bad shape", "", "REF", "/v1/transactions?reference=REF", `{"data":{"unknown":"unverified"}}`, true}} {
		t.Run(tt.name, func(t *testing.T) {
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if r.Method != "GET" || r.URL.RequestURI() != tt.path || r.Header.Get("Authorization") != "Bearer fixture-private" {
					t.Errorf("invalid authenticated request: %s %s", r.Method, r.URL.RequestURI())
				}
				w.Header().Set("Content-Type", "application/json")
				_, _ = w.Write([]byte(tt.response))
			}))
			defer server.Close()
			gateway := adapters.NewWompi(server.URL, "fixture-private", server.Client())
			result, err := gateway.Fetch(context.Background(), tt.id, tt.reference)
			if tt.wantError {
				if err == nil {
					t.Fatal("invalid gateway response accepted")
				}
				return
			}
			if err != nil || result == nil || result.ID != "provider-id" || result.Amount != 4500000 || result.Method == nil || *result.Method != "PSE" {
				t.Fatalf("result=%+v err=%v", result, err)
			}
		})
	}
}
func TestPaymentConfiguration(t *testing.T) {
	values := map[string]string{"WOMPI_PUBLIC_KEY": "pub_test_fixture", "WOMPI_PRIVATE_KEY": "prv_test_fixture", "WOMPI_INTEGRITY_SECRET": "fixture-integrity", "WOMPI_EVENTS_SECRET": "fixture-events", "WOMPI_ENVIRONMENT": "sandbox", "STOREFRONT_BASE_URL": "https://store.test"}
	config, err := adapters.LoadConfig(func(key string) string { return values[key] })
	if err != nil {
		t.Fatal(err)
	}
	if config.GatewayURL() != "https://sandbox.wompi.co" || config.HTTPTimeout != 10*time.Second {
		t.Fatal("incorrect sandbox gateway defaults")
	}
	for key := range values {
		t.Run(key, func(t *testing.T) {
			if _, err := adapters.LoadConfig(func(name string) string {
				if name == key {
					return ""
				}
				return values[name]
			}); err == nil {
				t.Fatal("missing configuration accepted")
			}
		})
	}
	for _, tt := range []struct{ name, value string }{{"WOMPI_ENVIRONMENT", "invalid"}, {"STOREFRONT_BASE_URL", "/relative"}, {"STOREFRONT_BASE_URL", "https://user:secret@store.test"}, {"STOREFRONT_BASE_URL", "https://store.test?token=secret"}} {
		if _, err := adapters.LoadConfig(func(key string) string {
			if key == tt.name {
				return tt.value
			}
			return values[key]
		}); err == nil {
			t.Fatal("invalid configuration accepted")
		}
	}
}
