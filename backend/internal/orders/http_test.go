package orders_test

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/freedomCruz/monte-luna/backend/internal/catalog"
	"github.com/freedomCruz/monte-luna/backend/internal/contracttest"
	"github.com/freedomCruz/monte-luna/backend/internal/invoicing"
	"github.com/freedomCruz/monte-luna/backend/internal/orders"
	"github.com/freedomCruz/monte-luna/backend/internal/shipping"
	_ "github.com/jackc/pgx/v5/stdlib"
	"github.com/testcontainers/testcontainers-go"
	pgcontainer "github.com/testcontainers/testcontainers-go/modules/postgres"
)

func storefront(t *testing.T) (*sql.DB, *http.ServeMux, *contracttest.Contract) {
	t.Helper()
	ctx, cancel := context.WithTimeout(t.Context(), 2*time.Minute)
	defer cancel()
	c, err := pgcontainer.Run(ctx, "postgres:18.6-bookworm@sha256:afc7e2d441324c0388fa80c3d24f733b4194a4eb7f47dd8ee2b08eb1a24a647c", pgcontainer.WithDatabase("orders_http"), pgcontainer.WithUsername("orders_http"), pgcontainer.WithPassword("orders_http"), pgcontainer.BasicWaitStrategies())
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
	mux := http.NewServeMux()
	orders.New(cat, ship, tax, logger).RegisterRoutes(mux)
	return db, mux, contracttest.Load(t, "orders.yaml")
}
func scalar[T any](t *testing.T, db *sql.DB, query string, args ...any) T {
	t.Helper()
	var result T
	if err := db.QueryRowContext(t.Context(), query, args...).Scan(&result); err != nil {
		t.Fatal(err)
	}
	return result
}
func execSQL(t *testing.T, db *sql.DB, query string, args ...any) {
	t.Helper()
	if _, err := db.ExecContext(t.Context(), query, args...); err != nil {
		t.Fatal(err)
	}
}
func snapshot(t *testing.T, db *sql.DB) string {
	t.Helper()
	var result string
	for _, table := range []string{"catalog.product_variants", "catalog.products", "catalog.variant_lot_stock", "catalog.inventory_movements", "shipping.shipping_zones", "shipping.shipping_zone_areas", "shipping.shipping_rates", "orders.orders", "orders.order_lines", "orders.order_line_lot_allocations", "orders.order_shipping_addresses", "orders.order_status_history", "orders.outbox"} {
		result += scalar[string](t, db, fmt.Sprintf(`SELECT COALESCE(jsonb_agg(to_jsonb(r) ORDER BY id),'[]'::jsonb)::text FROM %s r`, table))
	}
	return result
}
func exchange(t *testing.T, db *sql.DB, mux http.Handler, c *contracttest.Contract, payload string, invalid bool, status int, code, field string) map[string]any {
	t.Helper()
	before := snapshot(t, db)
	req := httptest.NewRequest("POST", "/api/v1/orders/quote", strings.NewReader(payload))
	req.Header.Set("Content-Type", "application/json")
	var rec *httptest.ResponseRecorder
	if invalid {
		rec = c.DoInvalid(t, mux, req)
	} else {
		rec = c.Do(t, mux, req)
	}
	if rec.Code != status {
		t.Fatalf("status=%d want=%d body=%s", rec.Code, status, rec.Body.String())
	}
	if rec.Header().Get("Cache-Control") != "no-store" {
		t.Fatal("missing no-store")
	}
	var body map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if code != "" {
		if body["code"] != code {
			t.Fatalf("code=%v want=%s", body["code"], code)
		}
		if field != "" {
			fields, ok := body["errors"].([]any)
			if !ok || len(fields) != 1 || fields[0].(map[string]any)["field"] != field {
				t.Fatalf("field errors=%v want=%s", body["errors"], field)
			}
			if code != "validation_failed" && fields[0].(map[string]any)["code"] != code {
				t.Fatalf("field code=%v", fields[0])
			}
		}
	}
	if snapshot(t, db) != before {
		t.Fatal("quote changed stored rows, stock counters or movements")
	}
	return body
}
func payload(id string, quantity int, code string) string {
	return fmt.Sprintf(`{"items":[{"variant_id":%q,"quantity":%d}],"municipality_code":%q}`, id, quantity, code)
}
func TestQuoteHTTPUsesLiveCatalogAndStoresNothing(t *testing.T) {
	db, mux, c := storefront(t)
	id := scalar[string](t, db, `SELECT id FROM catalog.product_variants WHERE sku='MIRADOR-250-WHOLE_BEAN'`)
	quote := exchange(t, db, mux, c, payload(id, 2, "11001"), false, 200, "", "")
	if quote["subtotal_amount"] != float64(7600000) || quote["shipping_amount"] != float64(800000) || quote["tax_amount"] != float64(0) || quote["total_amount"] != float64(8400000) {
		t.Fatalf("amounts=%v", quote)
	}
	line := quote["lines"].([]any)[0].(map[string]any)
	if line["variant_id"] != id || line["product_slug"] != "finca-el-mirador" || line["product_title"] != "Finca El Mirador" || line["variant_label"] != "250 g / Grano entero" || line["sku"] != "MIRADOR-250-WHOLE_BEAN" || line["unit_price_amount"] != float64(3800000) || line["quantity"] != float64(2) || line["line_total_amount"] != float64(7600000) {
		t.Fatalf("line=%v", line)
	}
	ship := quote["shipping"].(map[string]any)
	if ship["estimated_days_min"] != float64(3) || ship["estimated_days_max"] != float64(5) || ship["is_free_shipping"] != false {
		t.Fatalf("shipping=%v", ship)
	}
	execSQL(t, db, `UPDATE catalog.product_variants SET price_amount=3900000 WHERE id=$1`, id)
	updated := exchange(t, db, mux, c, payload(id, 2, "11001"), false, 200, "", "")
	if updated["total_amount"] != float64(8600000) {
		t.Fatalf("stale amount=%v", updated)
	}
	free := exchange(t, db, mux, c, payload(id, 4, "11001"), false, 200, "", "")
	if free["shipping_amount"] != float64(0) || free["shipping"].(map[string]any)["is_free_shipping"] != true || free["total_amount"] != float64(15600000) {
		t.Fatalf("free=%v", free)
	}
}
func TestQuoteHTTPValidationAndBusinessErrors(t *testing.T) {
	db, mux, c := storefront(t)
	id := scalar[string](t, db, `SELECT id FROM catalog.product_variants WHERE sku='MIRADOR-250-WHOLE_BEAN'`)
	soldOut := scalar[string](t, db, `SELECT id FROM catalog.product_variants WHERE sku='MIRADOR-500-COARSE'`)
	for _, tc := range []struct {
		name, body  string
		invalid     bool
		status      int
		code, field string
	}{
		{"unknown municipality", payload(id, 1, "99999"), false, 422, "unknown_municipality", "municipality_code"},
		{"unsupported destination", payload(id, 1, "76001"), false, 422, "unsupported_destination", "municipality_code"},
		{"nonexistent variant", payload("0199c4e2-7a1b-7c3d-9e0f-1a2b3c4d5e6f", 1, "11001"), false, 422, "variant_unavailable", "items[0].variant_id"},
		{"sold out", payload(soldOut, 1, "11001"), false, 409, "insufficient_stock", "items[0].quantity"},
		{"empty cart", `{"items":[],"municipality_code":"11001"}`, true, 422, "validation_failed", "items"},
		{"missing items", `{"municipality_code":"11001"}`, true, 422, "validation_failed", "items"},
		{"missing municipality", fmt.Sprintf(`{"items":[{"variant_id":%q,"quantity":1}]}`, id), true, 422, "validation_failed", "municipality_code"},
		{"municipality format", payload(id, 1, "1100"), true, 422, "validation_failed", "municipality_code"},
		{"quantity zero", payload(id, 0, "11001"), true, 422, "validation_failed", "items[0].quantity"},
		{"quantity above limit", payload(id, 100, "11001"), true, 422, "validation_failed", "items[0].quantity"},
		{"invalid variant", payload("invalid", 1, "11001"), false, 422, "validation_failed", "items[0].variant_id"},
		{"unknown root field", strings.Replace(payload(id, 1, "11001"), `"municipality_code"`, `"typo":true,"municipality_code"`, 1), true, 422, "validation_failed", "typo"},
		{"client price rejected", strings.Replace(payload(id, 1, "11001"), `"quantity":1`, `"quantity":1,"unit_price_amount":1`, 1), true, 422, "validation_failed", "items[0].unit_price_amount"},
		{"duplicate variants", fmt.Sprintf(`{"items":[{"variant_id":%q,"quantity":1},{"variant_id":%q,"quantity":1}],"municipality_code":"11001"}`, id, id), false, 422, "validation_failed", "items[1].variant_id"},
		{"fractional quantity", strings.Replace(payload(id, 1, "11001"), `"quantity":1`, `"quantity":1.5`, 1), true, 422, "validation_failed", "items[0].quantity"},
		{"malformed JSON", `{"items":`, true, 400, "malformed_request", ""},
	} {
		t.Run(tc.name, func(t *testing.T) { exchange(t, db, mux, c, tc.body, tc.invalid, tc.status, tc.code, tc.field) })
	}
	for _, change := range []string{`UPDATE catalog.product_variants SET status='archived' WHERE sku='MIRADOR-250-WHOLE_BEAN'`, `UPDATE catalog.product_variants SET status='active' WHERE sku='MIRADOR-250-WHOLE_BEAN';UPDATE catalog.products SET status='draft' WHERE slug='finca-el-mirador'`, `UPDATE catalog.products SET status='archived' WHERE slug='finca-el-mirador'`} {
		execSQL(t, db, change)
		exchange(t, db, mux, c, payload(id, 1, "11001"), false, 422, "variant_unavailable", "items[0].variant_id")
	}
	execSQL(t, db, `UPDATE catalog.products SET status='published' WHERE slug='finca-el-mirador';UPDATE catalog.variant_lot_stock SET quantity=1 WHERE variant_id=(SELECT id FROM catalog.product_variants WHERE sku='MIRADOR-250-WHOLE_BEAN')`)
	exchange(t, db, mux, c, payload(id, 99, "11001"), false, 409, "insufficient_stock", "items[0].quantity")
	execSQL(t, db, `UPDATE shipping.shipping_rates SET status='archived'`)
	exchange(t, db, mux, c, payload(id, 1, "11001"), false, 422, "unsupported_destination", "municipality_code")
}
