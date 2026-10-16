package payments_test

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/freedomCruz/monte-luna/backend/internal/contracttest"
	"github.com/freedomCruz/monte-luna/backend/internal/payments"
	"github.com/jackc/pgx/v5/pgxpool"
	_ "github.com/jackc/pgx/v5/stdlib"
	"github.com/testcontainers/testcontainers-go"
	pgcontainer "github.com/testcontainers/testcontainers-go/modules/postgres"
)

const trackingToken = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
const orderID = "0199c4e2-7a1b-7c3d-9e0f-1a2b3c4d5e6f"
const startKey = "0199c4e2-7a1b-7c3d-9e0f-1a2b3c4d5e70"

type testClock struct{ now time.Time }

func (c *testClock) Now() time.Time { return c.now }

type ordersReader struct{ order payments.Order }

func (o *ordersReader) Authorize(_ context.Context, hash string) (payments.Order, error) {
	sum := sha256.Sum256([]byte(trackingToken))
	otherSum := sha256.Sum256([]byte(strings.Repeat("B", 43)))
	if hash != hex.EncodeToString(sum[:]) && hash != hex.EncodeToString(otherSum[:]) {
		return payments.Order{}, payments.OrderNotFound()
	}
	return o.order, nil
}
func database(t *testing.T) (*sql.DB, *pgxpool.Pool, string) {
	t.Helper()
	ctx, cancel := context.WithTimeout(t.Context(), 2*time.Minute)
	defer cancel()
	c, err := pgcontainer.Run(ctx, "postgres:18.6-bookworm@sha256:afc7e2d441324c0388fa80c3d24f733b4194a4eb7f47dd8ee2b08eb1a24a647c", pgcontainer.WithDatabase("payments_test"), pgcontainer.WithUsername("payments_test"), pgcontainer.WithPassword("payments_test"), pgcontainer.BasicWaitStrategies())
	if err != nil {
		t.Fatal(err)
	}
	testcontainers.CleanupContainer(t, c)
	url, err := c.ConnectionString(ctx, "sslmode=disable")
	if err != nil {
		t.Fatal(err)
	}
	db, err := sql.Open("pgx", url)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = db.Close() })
	pool, err := pgxpool.New(ctx, url)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(pool.Close)
	return db, pool, url
}
func execute(t *testing.T, pool *pgxpool.Pool, query string, args ...any) {
	t.Helper()
	if _, err := pool.Exec(t.Context(), query, args...); err != nil {
		t.Fatal(err)
	}
}
func scalar[T any](t *testing.T, pool *pgxpool.Pool, query string, args ...any) T {
	t.Helper()
	var value T
	if err := pool.QueryRow(t.Context(), query, args...).Scan(&value); err != nil {
		t.Fatal(err)
	}
	return value
}
func snapshot(t *testing.T, pool *pgxpool.Pool) string {
	t.Helper()
	var all string
	for _, table := range []string{"payment_attempts", "refunds", "provider_webhook_events", "outbox", "processed_events", "idempotency_keys"} {
		all += scalar[string](t, pool, `SELECT COALESCE(jsonb_agg(to_jsonb(r))::text,'[]') FROM payments.`+table+` r`)
	}
	return all
}
func fixtureConfig() payments.Config {
	return payments.Config{PublicKey: "pub_test_fixture", PrivateKey: "prv_test_fixture", IntegritySecret: "fixture-integrity", EventsSecret: "fixture-events", Environment: "sandbox", StorefrontBaseURL: "https://store.test", HTTPTimeout: time.Second}
}
func request(method, path, body, key string) *http.Request {
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	if key != "" {
		req.Header.Set("Idempotency-Key", key)
	}
	return req
}
func TestMigrationAndPaymentStart(t *testing.T) {
	db, pool, url := database(t)
	for range 2 {
		if err := payments.Migrate(t.Context(), db); err != nil {
			t.Fatal(err)
		}
		if snapshot(t, pool) != "[][][][][][]" {
			t.Fatal("migration wrote business data")
		}
		if err := payments.Down(t.Context(), db); err != nil {
			t.Fatal(err)
		}
	}
	if err := payments.Migrate(t.Context(), db); err != nil {
		t.Fatal(err)
	}
	if scalar[int](t, pool, `SELECT count(*) FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace WHERE n.nspname='payments' AND c.contype='f' AND c.confrelid NOT IN (SELECT oid FROM pg_class WHERE relnamespace=n.oid)`) != 0 {
		t.Fatal("cross-schema foreign key")
	}
	clock := &testClock{time.Date(2026, 10, 16, 18, 0, 0, 0, time.UTC)}
	reader := &ordersReader{payments.Order{ID: orderID, Number: "ORD-7K2M9Q4X", Status: "pending_payment", Currency: "COP", Amount: 4500000, ExpiresAt: clock.now.Add(30 * time.Minute)}}
	module, err := payments.New(t.Context(), url, reader, fixtureConfig(), slog.New(slog.NewTextHandler(io.Discard, nil)), payments.Options{Clock: clock})
	if err != nil {
		t.Fatal(err)
	}
	defer module.Close()
	mux := http.NewServeMux()
	module.RegisterRoutes(mux)
	contract := contracttest.Load(t, "payments.yaml")
	body := `{"tracking_token":"` + trackingToken + `"}`
	rec := contract.Do(t, mux, request("POST", "/api/v1/payments", body, startKey))
	if rec.Code != 201 || rec.Header().Get("Location") != "/api/v1/payments/verify" || rec.Header().Get("Cache-Control") != "no-store" {
		t.Fatalf("start status=%d body=%s", rec.Code, rec.Body.String())
	}
	var checkout map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &checkout); err != nil {
		t.Fatal(err)
	}
	if checkout["amount_in_cents"] != float64(4500000) || checkout["redirect_url"] != "https://store.test/pedido?token="+trackingToken || checkout["expires_at"] != reader.order.ExpiresAt.Format(time.RFC3339) {
		t.Fatalf("incorrect checkout %s", rec.Body.String())
	}
	if scalar[int](t, pool, "SELECT count(*) FROM payments.payment_attempts WHERE status='created' AND amount=4500000 AND expires_at=$1", reader.order.ExpiresAt) != 1 || scalar[int](t, pool, "SELECT count(*) FROM payments.outbox") != 0 {
		t.Fatal("incorrect start records")
	}
	if scalar[bool](t, pool, "SELECT EXISTS(SELECT 1 FROM payments.idempotency_keys WHERE response_body::text LIKE $1)", "%"+trackingToken+"%") {
		t.Fatal("raw token persisted")
	}
	saved := snapshot(t, pool)
	clock.now = reader.order.ExpiresAt.Add(time.Minute)
	reader.order.Status = "expired"
	replay := contract.Do(t, mux, request("POST", "/api/v1/payments", body, strings.ToUpper(startKey)))
	if replay.Code != 201 || replay.Body.String() != rec.Body.String() || snapshot(t, pool) != saved {
		t.Fatal("idempotent replay changed response or state")
	}
	clock.now = clock.now.Add(25 * time.Hour)
	expired := contract.Do(t, mux, request("POST", "/api/v1/payments", body, startKey))
	if expired.Code != 422 || !strings.Contains(expired.Body.String(), "idempotency_key_reused") || snapshot(t, pool) != saved {
		t.Fatal("expired idempotency key reused")
	}
	reader.order.Status = "pending_payment"
	reader.order.ExpiresAt = clock.now.Add(time.Minute)
	for _, tt := range []struct {
		name, body, key, code string
		status                int
		invalid               bool
	}{{"pending", body, "0199c4e2-7a1b-7c3d-9e0f-1a2b3c4d5e71", "payment_pending", 409, false}, {"unknown", `{"tracking_token":"DDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD"}`, "0199c4e2-7a1b-7c3d-9e0f-1a2b3c4d5e72", "order_not_found", 404, false}, {"unknown field", `{"tracking_token":"` + trackingToken + `","amount":1}`, startKey, "validation_failed", 422, true}, {"missing key", body, "", "validation_failed", 422, true}} {
		t.Run(tt.name, func(t *testing.T) {
			execute(t, pool, "UPDATE payments.payment_attempts SET status='pending'")
			before := snapshot(t, pool)
			req := request("POST", "/api/v1/payments", tt.body, tt.key)
			var result *httptest.ResponseRecorder
			if tt.invalid {
				result = contract.DoInvalid(t, mux, req)
			} else {
				result = contract.Do(t, mux, req)
			}
			if result.Code != tt.status || !strings.Contains(result.Body.String(), tt.code) || snapshot(t, pool) != before {
				t.Fatalf("rejection status=%d body=%s", result.Code, result.Body.String())
			}
		})
	}
	// A different authorized body cannot reuse the original key.
	clock.now = reader.order.ExpiresAt.Add(-27 * time.Hour)
	before := snapshot(t, pool)
	reused := contract.Do(t, mux, request("POST", "/api/v1/payments", `{"tracking_token":"`+strings.Repeat("B", 43)+`"}`, startKey))
	if reused.Code != 422 || !strings.Contains(reused.Body.String(), "idempotency_key_reused") || snapshot(t, pool) != before {
		t.Fatal("changed idempotency body accepted or changed data")
	}
	// A rejected attempt can be retried with a fresh reference while reserved.
	execute(t, pool, "UPDATE payments.payment_attempts SET status='declined'")
	retry := contract.Do(t, mux, request("POST", "/api/v1/payments", body, "0199c4e2-7a1b-7c3d-9e0f-1a2b3c4d5e73"))
	if retry.Code != 201 || scalar[int](t, pool, "SELECT count(DISTINCT reference) FROM payments.payment_attempts") != 2 {
		t.Fatalf("decline retry status=%d body=%s", retry.Code, retry.Body.String())
	}
}
