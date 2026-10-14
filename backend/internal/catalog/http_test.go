package catalog_test

import (
	"context"
	"database/sql"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/freedomCruz/monte-luna/backend/internal/catalog"
	"github.com/freedomCruz/monte-luna/backend/internal/contracttest"
	_ "github.com/jackc/pgx/v5/stdlib"
	"github.com/testcontainers/testcontainers-go"
	pgcontainer "github.com/testcontainers/testcontainers-go/modules/postgres"
)

func storefront(t *testing.T) (*sql.DB, *http.ServeMux, *contracttest.Contract) {
	t.Helper()
	ctx, cancel := context.WithTimeout(t.Context(), 2*time.Minute)
	defer cancel()
	c, err := pgcontainer.Run(ctx, "postgres:18.6-bookworm@sha256:afc7e2d441324c0388fa80c3d24f733b4194a4eb7f47dd8ee2b08eb1a24a647c", pgcontainer.WithDatabase("catalog_http"), pgcontainer.WithUsername("catalog_http"), pgcontainer.WithPassword("catalog_http"), pgcontainer.BasicWaitStrategies())
	if err != nil {
		t.Fatal(err)
	}
	testcontainers.CleanupContainer(t, c)
	dsn, err := c.ConnectionString(ctx, "sslmode=disable")
	if err != nil {
		t.Fatal(err)
	}
	db, err := sql.Open("pgx", dsn)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if err := db.Close(); err != nil {
			t.Error(err)
		}
	})
	if err := catalog.Migrate(ctx, db); err != nil {
		t.Fatal(err)
	}
	if err := catalog.Seed(ctx, db); err != nil {
		t.Fatal(err)
	}
	module, err := catalog.New(ctx, dsn, "https://media.example/store/", slog.New(slog.NewTextHandler(io.Discard, nil)))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(module.Close)
	mux := http.NewServeMux()
	module.RegisterRoutes(mux)
	return db, mux, contracttest.Load(t, "catalog.yaml")
}
func read(t *testing.T, mux http.Handler, c *contracttest.Contract, path string, status int, cache string) map[string]any {
	t.Helper()
	rec := c.Do(t, mux, httptest.NewRequest(http.MethodGet, path, nil))
	if rec.Code != status {
		t.Fatalf("%s: status=%d body=%s", path, rec.Code, rec.Body.String())
	}
	if got := rec.Header().Get("Cache-Control"); got != cache {
		t.Errorf("%s cache=%q want %q", path, got, cache)
	}
	var body map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	return body
}
func items(t *testing.T, body map[string]any) []any {
	t.Helper()
	value, ok := body["items"].([]any)
	if !ok {
		t.Fatalf("items not an array: %v", body)
	}
	return value
}
func sqlFixture(t *testing.T, db *sql.DB, query string) {
	t.Helper()
	if _, err := db.ExecContext(t.Context(), query); err != nil {
		t.Fatal(err)
	}
}

func TestEveryCatalogEndpointAndFilters(t *testing.T) {
	_, mux, c := storefront(t)
	for _, path := range []string{"/api/v1/products", "/api/v1/products/finca-el-mirador", "/api/v1/categories", "/api/v1/origins", "/api/v1/origins/finca-el-mirador", "/api/v1/origins/finca-el-mirador/products"} {
		t.Run(path, func(t *testing.T) { read(t, mux, c, path, 200, "public, max-age=60") })
	}
	for _, tc := range []struct {
		query string
		count int
	}{
		{"category=coffee", 2}, {"product_type=cacao", 2}, {"category=coffee&product_type=cacao", 0},
		{"category=coffee&category=chocolate", 4}, {"product_type=coffee&product_type=cacao", 4}, {"category=unknown", 0},
	} {
		t.Run(tc.query, func(t *testing.T) {
			body := read(t, mux, c, "/api/v1/products?"+tc.query, 200, "public, max-age=60")
			if got := len(items(t, body)); got != tc.count {
				t.Errorf("count=%d want %d", got, tc.count)
			}
		})
	}
	product := read(t, mux, c, "/api/v1/products/finca-el-mirador", 200, "public, max-age=60")
	if product["price_amount"] != nil || product["availability"] != nil {
		t.Error("stable product contains volatile data")
	}
	images := product["images"].([]any)
	if images[0].(map[string]any)["url"] != "https://media.example/store/demo/products/finca-el-mirador.jpg" {
		t.Error("media URL not resolved")
	}
	origin := read(t, mux, c, "/api/v1/origins/finca-el-mirador", 200, "public, max-age=60")
	for _, key := range []string{"attributes", "varieties", "process", "tasting_notes", "cupping_score", "roast_level", "products"} {
		if _, exists := origin[key]; exists {
			t.Errorf("origin leaked product field %s", key)
		}
	}
	if origin["municipality_code"] != "41668" {
		t.Error("DANE code missing")
	}
	noOrigin := read(t, mux, c, "/api/v1/products/chocolate-85", 200, "public, max-age=60")
	if noOrigin["origin"] != nil {
		t.Error("originless product has origin")
	}
}

func TestListingPaginationAndCursorBinding(t *testing.T) {
	_, mux, c := storefront(t)
	for _, path := range []string{"/api/v1/products", "/api/v1/categories", "/api/v1/origins", "/api/v1/origins/finca-el-mirador/products", "/api/v1/product-availabilities?product_slug=finca-el-mirador&product_slug=chocolate-70"} {
		t.Run(path, func(t *testing.T) {
			cache := "public, max-age=60"
			if strings.Contains(path, "product-availabilities") {
				cache = "no-store"
			}
			sep := "?"
			if strings.Contains(path, "?") {
				sep = "&"
			}
			base := path + sep + "limit=1"
			next := base
			seen := map[string]bool{}
			pages := 0
			for {
				body := read(t, mux, c, next, 200, cache)
				values := items(t, body)
				if len(values) != 1 {
					t.Fatalf("page size=%d", len(values))
				}
				slugKey := "slug"
				if cache == "no-store" {
					slugKey = "product_slug"
				}
				slug := values[0].(map[string]any)[slugKey].(string)
				if seen[slug] {
					t.Fatal("duplicate page item")
				}
				seen[slug] = true
				pages++
				if pages > 10 {
					t.Fatal("cursor does not terminate")
				}
				cursor, ok := body["next_cursor"].(string)
				if !ok {
					break
				}
				next = base + "&cursor=" + url.QueryEscape(cursor)
			}
			if pages < 2 {
				t.Error("pagination did not expose all pages")
			}
		})
	}
	body := read(t, mux, c, "/api/v1/products?limit=1&category=coffee", 200, "public, max-age=60")
	cursor := body["next_cursor"].(string)
	problem := read(t, mux, c, "/api/v1/products?limit=1&category=cacao&cursor="+url.QueryEscape(cursor), 400, "public, max-age=60")
	if problem["code"] != "invalid_cursor" {
		t.Error("wrong cursor error")
	}
}

func TestHiddenCatalogRecords(t *testing.T) {
	db, mux, c := storefront(t)
	sqlFixture(t, db, `UPDATE catalog.products SET status='draft' WHERE slug='finca-la-maria'; UPDATE catalog.brands SET status='archived'; UPDATE catalog.origins SET status='archived' WHERE slug='demo-cacao-origin'; UPDATE catalog.categories SET status='archived' WHERE slug='cacao'; UPDATE catalog.product_variants SET status='archived' WHERE sku='MIRADOR-250-FINE'; INSERT INTO catalog.product_images (product_id,variant_id,storage_key,alt_text,position) SELECT product_id,id,'demo/hidden.jpg','hidden variant image',1 FROM catalog.product_variants WHERE sku='MIRADOR-250-FINE'`)
	for _, slug := range []string{"unknown", "finca-la-maria"} {
		problem := read(t, mux, c, "/api/v1/products/"+slug, 404, "public, max-age=60")
		if problem["code"] != "product_not_found" {
			t.Error("wrong product error")
		}
	}
	for _, slug := range []string{"unknown", "demo-cacao-origin"} {
		for _, suffix := range []string{"", "/products"} {
			problem := read(t, mux, c, "/api/v1/origins/"+slug+suffix, 404, "public, max-age=60")
			if problem["code"] != "origin_not_found" {
				t.Error("wrong origin error")
			}
		}
	}
	product := read(t, mux, c, "/api/v1/products/chocolate-70", 200, "public, max-age=60")
	if product["origin"] != nil || product["brand"] != nil {
		t.Error("archived relationships leaked")
	}
	if got := len(product["categories"].([]any)); got != 1 {
		t.Errorf("visible categories=%d", got)
	}
	product = read(t, mux, c, "/api/v1/products/finca-el-mirador", 200, "public, max-age=60")
	if len(product["variants"].([]any)) != 7 || len(product["images"].([]any)) != 1 {
		t.Error("inactive variants or their images leaked")
	}
	body := read(t, mux, c, "/api/v1/products", 200, "public, max-age=60")
	if len(items(t, body)) != 3 {
		t.Error("draft product leaked in collection")
	}
	body = read(t, mux, c, "/api/v1/categories", 200, "public, max-age=60")
	for _, v := range items(t, body) {
		entry := v.(map[string]any)
		if entry["slug"] == "chocolate" && entry["parent_slug"] != nil {
			t.Error("inactive parent leaked")
		}
	}
	live := read(t, mux, c, "/api/v1/product-availabilities?product_slug=finca-la-maria&product_slug=finca-el-mirador&product_slug=unknown", 200, "no-store")
	if len(items(t, live)) != 1 || len(items(t, live)[0].(map[string]any)["variants"].([]any)) != 7 {
		t.Error("hidden live product/variant leaked")
	}
}

func TestLiveVariantPricesAndOldestAvailableLot(t *testing.T) {
	db, mux, c := storefront(t)
	product := read(t, mux, c, "/api/v1/products/finca-el-mirador", 200, "public, max-age=60")
	sku := map[string]string{}
	for _, value := range product["variants"].([]any) {
		v := value.(map[string]any)
		sku[v["id"].(string)] = v["sku"].(string)
	}
	check := func() {
		body := read(t, mux, c, "/api/v1/product-availabilities?product_slug=finca-el-mirador", 200, "no-store")
		for _, value := range items(t, body)[0].(map[string]any)["variants"].([]any) {
			v := value.(map[string]any)
			switch sku[v["variant_id"].(string)] {
			case "MIRADOR-250-WHOLE_BEAN":
				if v["production_date"] != "2026-10-01" || v["availability"] != "in_stock" || v["price_amount"] != float64(3800000) || v["compare_at_price_amount"] != float64(4500000) {
					t.Errorf("whole bean live=%v", v)
				}
			case "MIRADOR-250-FINE":
				if v["production_date"] != "2026-10-08" {
					t.Error("empty older lot was used")
				}
			case "MIRADOR-500-COARSE":
				if v["production_date"] != nil || v["availability"] != "out_of_stock" {
					t.Error("out of stock needs null date")
				}
			}
		}
	}
	check()
	sqlFixture(t, db, `INSERT INTO catalog.lots (product_id,lot_code,production_date,status) SELECT id,'EARLIER-ARCHIVED','2026-09-01','archived' FROM catalog.products WHERE slug='finca-el-mirador'; INSERT INTO catalog.variant_lot_stock (product_id,variant_id,lot_id,quantity) SELECT v.product_id,v.id,l.id,100 FROM catalog.product_variants v JOIN catalog.lots l ON l.product_id=v.product_id WHERE l.lot_code='EARLIER-ARCHIVED' AND v.sku='MIRADOR-500-COARSE'`)
	check()
	body := read(t, mux, c, "/api/v1/product-availabilities?product_slug=chocolate-85", 200, "no-store")
	v := items(t, body)[0].(map[string]any)["variants"].([]any)[0].(map[string]any)
	if v["compare_at_price_amount"] != nil {
		t.Error("absent compare-at must be null")
	}
}

func TestCatalogRequestErrorsAndNoMutation(t *testing.T) {
	db, mux, c := storefront(t)
	var before string
	if err := db.QueryRowContext(t.Context(), `SELECT jsonb_agg(to_jsonb(s) ORDER BY id)::text FROM catalog.variant_lot_stock s`).Scan(&before); err != nil {
		t.Fatal(err)
	}
	for _, path := range []string{"/api/v1/products?typo=1", "/api/v1/products/finca-el-mirador?typo=1", "/api/v1/categories?typo=1", "/api/v1/origins?typo=1", "/api/v1/origins/finca-el-mirador?typo=1", "/api/v1/origins/finca-el-mirador/products?typo=1", "/api/v1/product-availabilities?product_slug=finca-el-mirador&typo=1"} {
		cache := "public, max-age=60"
		if strings.Contains(path, "product-availabilities") {
			cache = "no-store"
		}
		body := read(t, mux, c, path, 422, cache)
		if body["code"] != "validation_failed" || body["errors"].([]any)[0].(map[string]any)["code"] != "unknown_parameter" {
			t.Errorf("problem=%v", body)
		}
	}
	body := read(t, mux, c, "/api/v1/product-availabilities?product_slug=finca-el-mirador&cursor=bad", 400, "no-store")
	if body["code"] != "invalid_cursor" {
		t.Error("malformed cursor wrong code")
	}
	var after string
	if err := db.QueryRowContext(t.Context(), `SELECT jsonb_agg(to_jsonb(s) ORDER BY id)::text FROM catalog.variant_lot_stock s`).Scan(&after); err != nil {
		t.Fatal(err)
	}
	if before != after {
		t.Error("GET/errors changed stock")
	}
}
