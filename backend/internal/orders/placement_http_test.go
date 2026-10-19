package orders_test

import (
	"bytes"
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
	"sync"
	"testing"
	"time"

	"github.com/freedomCruz/monte-luna/backend/internal/catalog"
	"github.com/freedomCruz/monte-luna/backend/internal/contracttest"
	"github.com/freedomCruz/monte-luna/backend/internal/invoicing"
	"github.com/freedomCruz/monte-luna/backend/internal/orders"
	"github.com/freedomCruz/monte-luna/backend/internal/shipping"
	"github.com/testcontainers/testcontainers-go"
	pgcontainer "github.com/testcontainers/testcontainers-go/modules/postgres"
)

const key = "0199c4e2-7a1b-7c3d-9e0f-1a2b3c4d5e6f"

type testClock struct{ now time.Time }

func (c *testClock) Now() time.Time { return c.now }
func orderStorefront(t *testing.T, clock *testClock, numbers orders.OrderNumbers) (*sql.DB, *orders.Module, *http.ServeMux, *contracttest.Contract) {
	t.Helper()
	ctx, cancel := context.WithTimeout(t.Context(), 2*time.Minute)
	defer cancel()
	c, err := pgcontainer.Run(ctx, "postgres:18.6-bookworm@sha256:afc7e2d441324c0388fa80c3d24f733b4194a4eb7f47dd8ee2b08eb1a24a647c", pgcontainer.WithDatabase("orders_place"), pgcontainer.WithUsername("orders_place"), pgcontainer.WithPassword("orders_place"), pgcontainer.BasicWaitStrategies())
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
	t.Cleanup(func() {
		if err := db.Close(); err != nil {
			t.Error(err)
		}
	})
	for _, migrate := range []func(context.Context, *sql.DB) error{catalog.Migrate, shipping.Migrate, orders.Migrate} {
		if err := migrate(ctx, db); err != nil {
			t.Fatal(err)
		}
	}
	for _, seed := range []func(context.Context, *sql.DB) error{catalog.Seed, shipping.Seed, orders.Seed} {
		if err := seed(ctx, db); err != nil {
			t.Fatal(err)
		}
	}
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	cat, err := catalog.New(ctx, url, "https://media.example/", logger)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(cat.Close)
	ship, err := shipping.New(ctx, url)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(ship.Close)
	tax, err := invoicing.NewDemo()
	if err != nil {
		t.Fatal(err)
	}
	module, err := orders.NewRuntime(ctx, url, cat, ship, tax, []byte(strings.Repeat("s", 32)), logger, orders.RuntimeOptions{Clock: clock, OrderNumbers: numbers})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(module.Close)
	mux := http.NewServeMux()
	module.RegisterRoutes(mux)
	return db, module, mux, contracttest.Load(t, "orders.yaml")
}
func placeBody(id string, quantity int) string {
	body := map[string]any{"items": []map[string]any{{"variant_id": id, "quantity": quantity}}, "customer": map[string]any{"email": "Buyer@Example.com", "full_name": "Demo Buyer", "phone": nil}, "shipping_address": map[string]any{"recipient_name": "Demo Recipient", "recipient_phone": "3001234567", "municipality_code": "11001", "address_line1": "Calle 5 # 12-34", "address_line2": nil, "postal_code": nil, "delivery_notes": nil}, "fiscal_data": nil, "accepts_data_policy": true}
	encoded, _ := json.Marshal(body)
	return string(encoded)
}
func placementSnapshot(t *testing.T, db *sql.DB) string {
	t.Helper()
	return snapshot(t, db) + scalar[string](t, db, `SELECT COALESCE(jsonb_agg(to_jsonb(r) ORDER BY key),'[]'::jsonb)::text FROM orders.idempotency_keys r`)
}
func callPlacement(t *testing.T, mux http.Handler, c *contracttest.Contract, body, key string, invalid bool) *httptest.ResponseRecorder {
	t.Helper()
	request := httptest.NewRequest("POST", "/api/v1/orders", strings.NewReader(body)).WithContext(t.Context())
	request.Header.Set("Content-Type", "application/json")
	if key != "" {
		request.Header.Set("Idempotency-Key", key)
	}
	var response *httptest.ResponseRecorder
	if invalid {
		response = c.DoInvalid(t, mux, request)
	} else {
		response = c.Do(t, mux, request)
	}
	if response.Header().Get("Cache-Control") != "no-store" {
		t.Fatal("placement cache is not no-store")
	}
	return response
}
func decode(t *testing.T, response *httptest.ResponseRecorder) map[string]any {
	t.Helper()
	var body map[string]any
	if err := json.Unmarshal(response.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	return body
}
func assertProblem(t *testing.T, response *httptest.ResponseRecorder, status int, code, field string) {
	t.Helper()
	body := decode(t, response)
	if response.Code != status || body["code"] != code {
		t.Fatalf("status=%d body=%s want %d/%s", response.Code, response.Body.String(), status, code)
	}
	if field != "" {
		fields, ok := body["errors"].([]any)
		if !ok || len(fields) != 1 || fields[0].(map[string]any)["field"] != field {
			t.Fatalf("fields=%v want=%s", body["errors"], field)
		}
	}
}
func callTrack(t *testing.T, mux http.Handler, c *contracttest.Contract, token string, status int) map[string]any {
	t.Helper()
	request := httptest.NewRequest("GET", "/api/v1/orders/track?token="+token, nil)
	response := c.Do(t, mux, request)
	if response.Code != status || response.Header().Get("Cache-Control") != "no-store" {
		t.Fatalf("track status=%d body=%s", response.Code, response.Body.String())
	}
	return decode(t, response)
}
func TestPlacementReplaySnapshotsAndGuestPrivacy(t *testing.T) {
	clock := &testClock{now: time.Date(2026, 10, 15, 12, 0, 0, 0, time.UTC)}
	db, _, mux, c := orderStorefront(t, clock, nil)
	id := scalar[string](t, db, `SELECT id FROM catalog.product_variants WHERE sku='MIRADOR-250-WHOLE_BEAN'`)
	body := placeBody(id, 2)
	response := callPlacement(t, mux, c, body, key, false)
	if response.Code != 201 {
		t.Fatal(response.Body.String())
	}
	placed := decode(t, response)
	token := placed["tracking_token"].(string)
	orderID := placed["order_id"].(string)
	if response.Header().Get("Location") != "/api/v1/orders/track?token="+token {
		t.Fatal("invalid Location")
	}
	expires, err := time.Parse(time.RFC3339Nano, placed["reservation_expires_at"].(string))
	if err != nil || expires.Sub(clock.now) != 30*time.Minute {
		t.Fatal("reservation is not 30 minutes")
	}
	before := placementSnapshot(t, db)
	replay := callPlacement(t, mux, c, body, strings.ToUpper(key), false)
	if replay.Code != 201 || !bytes.Equal(replay.Body.Bytes(), response.Body.Bytes()) {
		t.Fatalf("nonidentical replay %s vs %s", replay.Body.String(), response.Body.String())
	}
	if placementSnapshot(t, db) != before {
		t.Fatal("replay changed persisted data")
	}
	hash := sha256.Sum256([]byte(token))
	if scalar[string](t, db, `SELECT tracking_token_hash FROM orders.orders WHERE id=$1`, orderID) != hex.EncodeToString(hash[:]) {
		t.Fatal("stored token hash mismatch")
	}
	stored := scalar[string](t, db, `SELECT response_body::text FROM orders.idempotency_keys`)
	if strings.Contains(stored, "tracking_token") || strings.Contains(stored, token) {
		t.Fatal("raw tracking token persisted")
	}
	if scalar[string](t, db, `SELECT customer_email FROM orders.orders WHERE id=$1`, orderID) != "buyer@example.com" {
		t.Fatal("email not lowercased")
	}
	if scalar[int](t, db, `SELECT count(*) FROM orders.outbox WHERE type='orders.order_placed'`) != 1 || scalar[int](t, db, `SELECT count(*) FROM orders.order_status_history`) != 1 {
		t.Fatal("missing transaction outbox/history")
	}
	if scalar[string](t, db, `SELECT fiscal_profile_snapshot->>'country' FROM orders.orders WHERE id=$1`, orderID) != "CO" || !scalar[bool](t, db, `SELECT fiscal_profile_snapshot->'tax_regime'='null'::jsonb FROM orders.orders WHERE id=$1`, orderID) {
		t.Fatal("fiscal snapshot mismatch")
	}
	guest := callTrack(t, mux, c, token, 200)
	if payment, exists := guest["payment"]; !exists || payment != nil {
		t.Fatalf("guest payment=%v exists=%v; want explicit null without an attempt", payment, exists)
	}
	if guest["order_number"] != placed["order_number"] || guest["status"] != "pending_payment" || guest["total_amount"] != placed["total_amount"] || guest["shipment"] != nil {
		t.Fatalf("guest=%v", guest)
	}
	line := guest["lines"].([]any)[0].(map[string]any)
	if line["product_slug"] != "finca-el-mirador" || line["production_date"] != "2026-10-01" {
		t.Fatalf("guest line=%v", line)
	}
	address := guest["shipping_address"].(map[string]any)
	if address["recipient_name"] != "Demo Recipient" || address["recipient_phone"] != "3001234567" || address["department_name"] != "Bogotá, D. C." || address["municipality_name"] != "Bogotá, D. C." {
		t.Fatalf("address=%v", address)
	}
	serialized, _ := json.Marshal(guest)
	for _, private := range []string{"buyer@example.com", "Demo Buyer", "customer_phone", "fiscal_profile", "document_number", "tracking_token"} {
		if strings.Contains(string(serialized), private) {
			t.Fatalf("guest leaked %s", private)
		}
	}
	execSQL(t, db, `UPDATE catalog.products SET title='Edited',slug='edited',status='archived' WHERE slug='finca-el-mirador';UPDATE shipping.shipping_rates SET name='Edited',estimated_days_min=8,estimated_days_max=9`)
	again := callTrack(t, mux, c, token, 200)
	original, _ := json.Marshal(guest)
	updated, _ := json.Marshal(again)
	if !bytes.Equal(original, updated) {
		t.Fatal("live edits changed order snapshots")
	}
	unknown := callTrack(t, mux, c, strings.Repeat("A", 43), 404)
	if unknown["code"] != "order_not_found" {
		t.Fatal(unknown)
	}
}
func TestPlacementValidationLeavesAllDataUnchanged(t *testing.T) {
	clock := &testClock{now: time.Now().UTC()}
	db, _, mux, c := orderStorefront(t, clock, nil)
	id := scalar[string](t, db, `SELECT id FROM catalog.product_variants WHERE sku='MIRADOR-250-WHOLE_BEAN'`)
	valid := placeBody(id, 1)
	for _, tc := range []struct {
		name, body, key string
		invalid         bool
		status          int
		code, field     string
	}{
		{"missing key", valid, "", true, 422, "validation_failed", "Idempotency-Key"},
		{"invalid key", valid, "invalid", false, 422, "validation_failed", "Idempotency-Key"},
		{"consent", strings.Replace(valid, `"accepts_data_policy":true`, `"accepts_data_policy":false`, 1), key, true, 422, "validation_failed", "accepts_data_policy"},
		{"unknown root", strings.Replace(valid, `"accepts_data_policy":true`, `"accepts_data_policy":true,"coupon":"NO"`, 1), key, true, 422, "validation_failed", "coupon"},
		{"client amount", strings.Replace(valid, `"quantity":1`, `"quantity":1,"unit_price_amount":1`, 1), key, true, 422, "validation_failed", "items[0].unit_price_amount"},
		{"buyer email", strings.Replace(valid, "Buyer@Example.com", "bad", 1), key, false, 422, "validation_failed", "customer.email"},
		{"recipient phone", strings.Replace(valid, "3001234567", "123", 1), key, true, 422, "validation_failed", "shipping_address.recipient_phone"},
		{"unknown municipality", strings.Replace(valid, "11001", "99999", 1), key, false, 422, "unknown_municipality", "shipping_address.municipality_code"},
		{"unsupported destination", strings.Replace(valid, "11001", "76001", 1), key, false, 422, "unsupported_destination", "shipping_address.municipality_code"},
		{"natural NIT", strings.Replace(valid, `"fiscal_data":null`, `"fiscal_data":{"person_type":"natural","document_type":"NIT","document_number":"1234"}`, 1), key, false, 422, "validation_failed", "fiscal_data.document_type"},
		{"legal CC", strings.Replace(valid, `"fiscal_data":null`, `"fiscal_data":{"person_type":"legal","document_type":"CC","document_number":"1234"}`, 1), key, false, 422, "validation_failed", "fiscal_data.document_type"},
		{"unknown variant", strings.Replace(valid, id, "0199c4e2-7a1b-7c3d-9e0f-1a2b3c4d5e60", 1), key, false, 422, "variant_unavailable", "items[0].variant_id"},
		{"quantity", placeBody(id, 100), key, true, 422, "validation_failed", "items[0].quantity"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			before := placementSnapshot(t, db)
			response := callPlacement(t, mux, c, tc.body, tc.key, tc.invalid)
			assertProblem(t, response, tc.status, tc.code, tc.field)
			if placementSnapshot(t, db) != before {
				t.Fatal("rejection stored orders/stock/movements/events/idempotency data")
			}
		})
	}
	sold := scalar[string](t, db, `SELECT id FROM catalog.product_variants WHERE sku='MIRADOR-500-COARSE'`)
	before := placementSnapshot(t, db)
	assertProblem(t, callPlacement(t, mux, c, placeBody(sold, 1), key, false), 409, "insufficient_stock", "items[0].quantity")
	if placementSnapshot(t, db) != before {
		t.Fatal("409 changed stored data")
	}
}
func TestConcurrentPlacementsLastUnitAndSameKey(t *testing.T) {
	for _, sameKey := range []bool{false, true} {
		t.Run(map[bool]string{false: "different keys last unit", true: "same key replay"}[sameKey], func(t *testing.T) {
			clock := &testClock{now: time.Now().UTC()}
			db, _, mux, c := orderStorefront(t, clock, nil)
			id := scalar[string](t, db, `SELECT id FROM catalog.product_variants WHERE sku='MIRADOR-250-WHOLE_BEAN'`)
			execSQL(t, db, `UPDATE catalog.variant_lot_stock SET quantity=0 WHERE variant_id=$1`, id)
			execSQL(t, db, `UPDATE catalog.variant_lot_stock SET quantity=1 WHERE id=(SELECT id FROM catalog.variant_lot_stock WHERE variant_id=$1 ORDER BY lot_id LIMIT 1)`, id)
			start := make(chan struct{})
			var wg sync.WaitGroup
			responses := make([]*httptest.ResponseRecorder, 2)
			for i := range 2 {
				wg.Go(func() {
					<-start
					k := key
					if i == 1 && !sameKey {
						k = "0199c4e2-7a1b-7c3d-9e0f-1a2b3c4d5e61"
					}
					responses[i] = callPlacement(t, mux, c, placeBody(id, 1), k, false)
				})
			}
			close(start)
			wg.Wait()
			success, shortage := 0, 0
			for _, response := range responses {
				if response == nil {
					t.Fatal("request failed before response")
				}
				if response.Code == 201 {
					success++
				} else {
					assertProblem(t, response, 409, "insufficient_stock", "items[0].quantity")
					shortage++
				}
			}
			if sameKey {
				if success != 2 || !bytes.Equal(responses[0].Body.Bytes(), responses[1].Body.Bytes()) {
					t.Fatal("same key created nonidentical responses")
				}
			} else if success != 1 || shortage != 1 {
				t.Fatalf("success=%d shortage=%d", success, shortage)
			}
			if scalar[int](t, db, `SELECT count(*) FROM orders.orders`) != 1 || scalar[int](t, db, `SELECT count(*) FROM orders.idempotency_keys`) != 1 || scalar[int](t, db, `SELECT count(*) FROM orders.outbox`) != 1 || scalar[int](t, db, `SELECT count(*) FROM catalog.inventory_movements WHERE reason='sale'`) != 1 || scalar[int](t, db, `SELECT min(quantity) FROM catalog.variant_lot_stock`) < 0 {
				t.Fatal("concurrency violated persistence/stock invariants")
			}
		})
	}
}
func TestPersistenceFailureCompensatesAndCanRetry(t *testing.T) {
	clock := &testClock{now: time.Now().UTC()}
	db, _, mux, c := orderStorefront(t, clock, nil)
	id := scalar[string](t, db, `SELECT id FROM catalog.product_variants WHERE sku='MIRADOR-250-WHOLE_BEAN'`)
	initial := scalar[int64](t, db, `SELECT sum(quantity) FROM catalog.variant_lot_stock WHERE variant_id=$1`, id)
	execSQL(t, db, `ALTER TABLE orders.outbox ADD CONSTRAINT injected_failure CHECK(type<>'orders.order_placed')`)
	response := callPlacement(t, mux, c, placeBody(id, 1), key, false)
	assertProblem(t, response, 500, "internal_error", "")
	if scalar[int](t, db, `SELECT count(*) FROM orders.orders`) != 0 || scalar[int](t, db, `SELECT count(*) FROM orders.idempotency_keys`) != 0 || scalar[int](t, db, `SELECT count(*) FROM orders.outbox`) != 0 || scalar[int](t, db, `SELECT count(*) FROM orders.order_status_history`) != 0 {
		t.Fatal("failed persistence left orders transaction rows")
	}
	if scalar[int64](t, db, `SELECT sum(quantity) FROM catalog.variant_lot_stock WHERE variant_id=$1`, id) != initial || scalar[int64](t, db, `SELECT COALESCE(sum(quantity_delta),0) FROM catalog.inventory_movements WHERE reason IN ('sale','release')`) != 0 || scalar[int](t, db, `SELECT count(*) FROM catalog.inventory_movements WHERE reason='release'`) != 1 {
		t.Fatal("compensation did not restore inventory exactly once")
	}
	if strings.Contains(response.Body.String(), "injected_failure") || strings.Contains(response.Body.String(), "SQL") {
		t.Fatal("persistence detail leaked")
	}
	execSQL(t, db, `ALTER TABLE orders.outbox DROP CONSTRAINT injected_failure`)
	if response := callPlacement(t, mux, c, placeBody(id, 1), key, false); response.Code != 201 {
		t.Fatal(response.Body.String())
	}
}
func TestExpiryOverlapsCleanupAndExpiredKeyRejection(t *testing.T) {
	clock := &testClock{now: time.Date(2026, 10, 15, 12, 0, 0, 0, time.UTC)}
	db, module, mux, c := orderStorefront(t, clock, nil)
	id := scalar[string](t, db, `SELECT id FROM catalog.product_variants WHERE sku='MIRADOR-250-WHOLE_BEAN'`)
	stock := scalar[int64](t, db, `SELECT sum(quantity) FROM catalog.variant_lot_stock WHERE variant_id=$1`, id)
	body := placeBody(id, 1)
	response := callPlacement(t, mux, c, body, key, false)
	if response.Code != 201 {
		t.Fatal(response.Body.String())
	}
	token := decode(t, response)["tracking_token"].(string)
	before := placementSnapshot(t, db)
	changed := strings.Replace(body, "Demo Buyer", "Other Buyer", 1)
	assertProblem(t, callPlacement(t, mux, c, changed, key, false), 422, "idempotency_key_reused", "")
	if placementSnapshot(t, db) != before {
		t.Fatal("different body mutated data")
	}
	clock.now = clock.now.Add(30 * time.Minute)
	var wg sync.WaitGroup
	counts := make(chan int, 2)
	failures := make(chan error, 2)
	for range 2 {
		wg.Go(func() { n, err := module.RunMaintenance(t.Context()); counts <- n; failures <- err })
	}
	wg.Wait()
	close(counts)
	close(failures)
	sum := 0
	for n := range counts {
		sum += n
	}
	for err := range failures {
		if err != nil {
			t.Fatal(err)
		}
	}
	if sum != 1 || scalar[string](t, db, `SELECT status FROM orders.orders`) != "expired" || scalar[int](t, db, `SELECT count(*) FROM orders.order_status_history WHERE to_status='expired'`) != 1 || scalar[int](t, db, `SELECT count(*) FROM orders.outbox WHERE type='orders.order_expired'`) != 1 || scalar[int](t, db, `SELECT count(*) FROM catalog.inventory_movements WHERE reason='release'`) != 1 || scalar[int64](t, db, `SELECT sum(quantity) FROM catalog.variant_lot_stock WHERE variant_id=$1`, id) != stock {
		t.Fatal("expiry was not exactly once")
	}
	guest := callTrack(t, mux, c, token, 200)
	if guest["status"] != "expired" {
		t.Fatal(guest)
	}
	before = placementSnapshot(t, db)
	if n, err := module.RunMaintenance(t.Context()); err != nil || n != 0 {
		t.Fatalf("repeat expiry=%d/%v", n, err)
	}
	if placementSnapshot(t, db) != before {
		t.Fatal("repeat expiry changed state")
	}
	clock.now = clock.now.Add(24 * time.Hour)
	if _, err := module.RunMaintenance(t.Context()); err != nil {
		t.Fatal(err)
	}
	if scalar[int](t, db, `SELECT count(*) FROM orders.idempotency_keys`) != 0 {
		t.Fatal("expired keys not cleaned")
	}
	before = placementSnapshot(t, db)
	for _, expiredBody := range []string{body, changed} {
		assertProblem(t, callPlacement(t, mux, c, expiredBody, key, false), 422, "idempotency_key_reused", "")
		if placementSnapshot(t, db) != before {
			t.Fatal("expired key reuse stored data")
		}
	}
}
func TestFreeShippingFlagIsSnapshottedNotInferred(t *testing.T) {
	clock := &testClock{now: time.Now().UTC()}
	db, _, mux, c := orderStorefront(t, clock, nil)
	id := scalar[string](t, db, `SELECT id FROM catalog.product_variants WHERE sku='MIRADOR-250-WHOLE_BEAN'`)
	for i, quantity := range []int{4, 1} {
		k := key
		want := true
		if i == 1 {
			k = "0199c4e2-7a1b-7c3d-9e0f-1a2b3c4d5e62"
			want = false
			execSQL(t, db, `UPDATE shipping.shipping_rates SET price_amount=0,free_shipping_threshold_amount=NULL`)
		}
		response := callPlacement(t, mux, c, placeBody(id, quantity), k, false)
		if response.Code != 201 {
			t.Fatal(response.Body.String())
		}
		placed := decode(t, response)
		guest := callTrack(t, mux, c, placed["tracking_token"].(string), 200)
		summary := guest["shipping"].(map[string]any)
		if summary["shipping_amount"] != float64(0) || summary["is_free_shipping"] != want || scalar[bool](t, db, `SELECT shipping_is_free_shipping FROM orders.orders WHERE id=$1`, placed["order_id"]) != want {
			t.Fatalf("flag snapshot=%v want=%v", summary, want)
		}
	}
}
