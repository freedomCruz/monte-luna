package catalog_test

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
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
	"github.com/freedomCruz/monte-luna/backend/internal/identity"
	"github.com/testcontainers/testcontainers-go"
	pgcontainer "github.com/testcontainers/testcontainers-go/modules/postgres"
)

type catalogReadAccess struct {
	role string
	err  error
}

func (a *catalogReadAccess) Require(context.Context, string) (identity.Principal, error) {
	return identity.Principal{Role: a.role}, a.err
}

type catalogReadOrders struct {
	held   []catalog.HeldQuantity
	orders map[string]catalog.AdminMovementOrder
	err    error
	calls  int
}

func (o *catalogReadOrders) HeldQuantities(context.Context, []string) ([]catalog.HeldQuantity, error) {
	o.calls++
	return o.held, o.err
}
func (o *catalogReadOrders) MovementOrders(context.Context, []string) (map[string]catalog.AdminMovementOrder, error) {
	o.calls++
	return o.orders, o.err
}

type catalogReadNames struct {
	values map[string]string
	err    error
	calls  int
}

func (n *catalogReadNames) AdminNames(context.Context, []string) (map[string]string, error) {
	n.calls++
	return n.values, n.err
}
func adminCatalog(t *testing.T) (*sql.DB, *http.ServeMux, *contracttest.Contract, *catalogReadAccess, *catalogReadOrders, *catalogReadNames) {
	t.Helper()
	ctx, cancel := context.WithTimeout(t.Context(), 2*time.Minute)
	defer cancel()
	c, err := pgcontainer.Run(ctx, "postgres:18.6-bookworm@sha256:afc7e2d441324c0388fa80c3d24f733b4194a4eb7f47dd8ee2b08eb1a24a647c", pgcontainer.WithDatabase("catalog_admin"), pgcontainer.WithUsername("test"), pgcontainer.WithPassword("test"), pgcontainer.BasicWaitStrategies())
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
	m, err := catalog.New(ctx, dsn, "https://media.example/store/", slog.New(slog.NewTextHandler(io.Discard, nil)))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(m.Close)
	access, orders, names := &catalogReadAccess{role: "staff"}, &catalogReadOrders{orders: map[string]catalog.AdminMovementOrder{}}, &catalogReadNames{values: map[string]string{}}
	mux := http.NewServeMux()
	if err := m.RegisterAdminReadRoutes(mux, access, func(h http.Handler) http.Handler { return h }, orders, names, func() time.Time { return time.Date(2026, 11, 1, 5, 0, 0, 0, time.UTC) }); err != nil {
		t.Fatal(err)
	}
	if err := m.EnableMedia(catalog.MediaConfig{Storage: "disabled"}); err != nil {
		t.Fatal(err)
	}
	if err := m.RegisterAdminMediaRoutes(mux, access, func(h http.Handler) http.Handler { return h }); err != nil {
		t.Fatal(err)
	}
	return db, mux, contracttest.Load(t, "catalog.yaml"), access, orders, names
}
func adminScalar(t *testing.T, db *sql.DB, query string, args ...any) string {
	t.Helper()
	var v string
	if err := db.QueryRowContext(t.Context(), query, args...).Scan(&v); err != nil {
		t.Fatal(err)
	}
	return v
}
func TestAdminCatalogReadHTTPContract(t *testing.T) {
	db, mux, c, access, orders, names := adminCatalog(t)
	product := adminScalar(t, db, `SELECT id FROM catalog.products WHERE slug='finca-el-mirador'`)
	variant := adminScalar(t, db, `SELECT id FROM catalog.product_variants WHERE sku='MIRADOR-250-WHOLE_BEAN'`)
	lot := adminScalar(t, db, `SELECT lot_id FROM catalog.variant_lot_stock WHERE variant_id=$1 ORDER BY lot_id LIMIT 1`, variant)
	image := adminScalar(t, db, `SELECT id FROM catalog.product_images WHERE product_id=$1 ORDER BY position,id LIMIT 1`, product)
	const missing = "01946894-3d9a-7c98-b807-6c84c1762c39"
	base := "/api/v1/admin/inventory/variants/" + variant
	paths := []string{"/api/v1/admin/products", "/api/v1/admin/products/" + product, "/api/v1/admin/products/" + product + "/variants/" + variant, "/api/v1/admin/products/" + product + "/images/" + image, "/api/v1/admin/catalog/categories", "/api/v1/admin/catalog/origins", "/api/v1/admin/catalog/brands", "/api/v1/admin/catalog/product-types", "/api/v1/admin/inventory/variants", base, base + "/lots", base + "/movements"}
	for _, role := range []string{"staff", "owner"} {
		access.role = role
		for _, path := range paths {
			t.Run(role+path, func(t *testing.T) {
				body := read(t, mux, c, path, 200, "no-store")
				if body["version"] != nil {
					r := c.Do(t, mux, httptest.NewRequest("GET", path, nil))
					if r.Header().Get("ETag") != `"1"` {
						t.Fatalf("ETag %q", r.Header().Get("ETag"))
					}
				}
			})
		}
	}
	access.role = "staff"
	if _, err := db.ExecContext(t.Context(), `UPDATE catalog.products SET version=7 WHERE id=$1`, product); err != nil {
		t.Fatal(err)
	}
	if _, err := db.ExecContext(t.Context(), `UPDATE catalog.product_variants SET version=3 WHERE id=$1`, variant); err != nil {
		t.Fatal(err)
	}
	for _, path := range []string{"/api/v1/admin/products/" + product, "/api/v1/admin/products/" + product + "/variants/" + variant, "/api/v1/admin/products/" + product + "/images/" + image, base} {
		rec := c.Do(t, mux, httptest.NewRequest("GET", path, nil))
		if rec.Code != 200 || rec.Header().Get("ETag") != `"7"` {
			t.Fatalf("parent ETag %s: %d %q", path, rec.Code, rec.Header().Get("ETag"))
		}
	}
	detail := read(t, mux, c, "/api/v1/admin/products/"+product, 200, "no-store")
	if !strings.HasPrefix(detail["images"].([]any)[0].(map[string]any)["url"].(string), "https://media.example/store/") {
		t.Fatal("media key not resolved")
	}
	for _, tt := range []struct {
		path   string
		status int
		code   string
	}{
		{"/api/v1/admin/products?limit=24", 422, "validation_failed"}, {"/api/v1/admin/products?cursor=broken", 400, "bad_request"},
		{"/api/v1/admin/products?unknown=x", 422, "validation_failed"}, {"/api/v1/admin/products?search=a&search=b", 422, "validation_failed"},
		{"/api/v1/admin/products/invalid", 400, "bad_request"}, {"/api/v1/admin/products/" + missing, 404, "product_not_found"},
		{"/api/v1/admin/products/" + product + "/variants/" + missing, 404, "variant_not_found"}, {"/api/v1/admin/products/" + product + "/variants/invalid", 400, "bad_request"},
		{"/api/v1/admin/catalog/product-types?status=active", 422, "validation_failed"}, {base + "/lots?sort=title", 422, "validation_failed"},
		{"/api/v1/admin/inventory/variants/" + missing, 404, "variant_not_found"}, {"/api/v1/admin/inventory/variants/" + missing + "/lots", 404, "variant_not_found"}, {"/api/v1/admin/inventory/variants/" + missing + "/movements", 404, "variant_not_found"},
	} {
		var b map[string]any
		if strings.Contains(tt.path, "limit=24") {
			rec := c.DoInvalid(t, mux, httptest.NewRequest("GET", tt.path, nil))
			if rec.Code != tt.status || rec.Header().Get("Cache-Control") != "no-store" {
				t.Fatalf("negative %s: %d %s", tt.path, rec.Code, rec.Body.String())
			}
			if err := json.Unmarshal(rec.Body.Bytes(), &b); err != nil {
				t.Fatal(err)
			}
		} else {
			b = read(t, mux, c, tt.path, tt.status, "no-store")
		}
		if b["code"] != tt.code {
			t.Fatalf("%s %v", tt.path, b)
		}
	}
	// Server computation crosses the Bogota date boundary; neither client clock
	// nor lot status suppresses the old-roast flag.
	if _, err := db.ExecContext(t.Context(), `UPDATE catalog.lots SET production_date='2026-10-01' WHERE id=$1`, lot); err != nil {
		t.Fatal(err)
	}
	orders.held = []catalog.HeldQuantity{{VariantID: variant, LotID: lot, Quantity: 4}}
	summary := read(t, mux, c, base, 200, "no-store")
	if summary["reserved_quantity"] != float64(4) {
		t.Fatalf("summary %v", summary)
	}
	lots := read(t, mux, c, base+"/lots", 200, "no-store")
	found := false
	for _, v := range items(t, lots) {
		m := v.(map[string]any)
		if m["id"] == lot {
			found = true
			if m["old_roast"] != true || m["reserved_quantity"] != float64(4) {
				t.Fatalf("lot %v", m)
			}
		}
	}
	if !found {
		t.Fatal("lot missing")
	}
	// Current order context drives sale display; missing actors remain unknown,
	// while null actor IDs are system. Exactly one batched lookup per page.
	actor, order := missing, "01946894-3d9a-7c98-b807-6c84c1762c38"
	if _, err := db.ExecContext(t.Context(), `INSERT INTO catalog.inventory_movements(variant_id,lot_id,quantity_delta,reason,reference_id,actor_id,created_at) VALUES ($1,$2,-1,'sale',$3,$4,'2026-12-01T00:00:00Z')`, variant, lot, order, actor); err != nil {
		t.Fatal(err)
	}
	names.values[actor] = "Current Admin"
	for _, tt := range []struct{ state, want string }{{"held", "reservation"}, {"committed", "sale"}, {"released", "allocation"}} {
		orders.orders[order] = catalog.AdminMovementOrder{ID: order, OrderNumber: "ORD-TEST", Status: "pending_payment", ReservationState: tt.state}
		calls := names.calls
		movements := read(t, mux, c, base+"/movements", 200, "no-store")
		first := items(t, movements)[0].(map[string]any)
		if first["display_kind"] != tt.want || first["actor_name"] != "Current Admin" || names.calls != calls+1 {
			t.Fatalf("movement %v", first)
		}
	}
	delete(orders.orders, order)
	delete(names.values, actor)
	movements := read(t, mux, c, base+"/movements", 200, "no-store")
	first := items(t, movements)[0].(map[string]any)
	if first["display_kind"] != "allocation" || first["actor_name"] != nil || first["order"] != nil {
		t.Fatalf("unresolved %v", first)
	}
	empty := read(t, mux, c, base+"/movements?lot_id="+missing, 200, "no-store")
	if len(items(t, empty)) != 0 {
		t.Fatal("unrelated lot matched")
	}
	orders.err = errors.New("orders down")
	for _, path := range []string{"/api/v1/admin/inventory/variants", base, base + "/lots", base + "/movements"} {
		b := read(t, mux, c, path, 503, "no-store")
		if b["code"] != "dependency_unavailable" {
			t.Fatalf("dependency %v", b)
		}
	}
	orders.err = nil
	names.err = errors.New("identity down")
	read(t, mux, c, base+"/movements", 503, "no-store")
	names.err = nil
	// Every new admin read rejects unauthenticated/forbidden callers before any
	// external composition, including invalid input that could reveal existence.
	for _, tt := range []struct {
		role   string
		err    error
		status int
	}{{"", identity.ErrAuthenticationRequired, 401}, {"owner", identity.ErrForbidden, 403}, {"buyer", nil, 403}} {
		access.role, access.err = tt.role, tt.err
		for _, path := range paths {
			calls := orders.calls
			read(t, mux, c, path, tt.status, "no-store")
			if orders.calls != calls {
				t.Fatal("unauthorized composition")
			}
		}
	}
}

func TestAdminProductsHTTPPaginationAndFilters(t *testing.T) {
	db, mux, c, _, _, _ := adminCatalog(t)
	typeID := adminScalar(t, db, `SELECT id FROM catalog.product_types WHERE slug='coffee'`)
	if _, err := db.ExecContext(t.Context(), `INSERT INTO catalog.products(product_type_id,title,slug,status) SELECT $1,'Cursor Product','cursor-'||n,'draft' FROM generate_series(1,30)n`, typeID); err != nil {
		t.Fatal(err)
	}
	path := "/api/v1/admin/products?status=draft&product_type_id=" + typeID
	first := read(t, mux, c, path, 200, "no-store")
	if first["total"] != float64(30) || len(items(t, first)) != 25 {
		t.Fatalf("first %v", first)
	}
	next := read(t, mux, c, path+"&cursor="+url.QueryEscape(first["next_cursor"].(string)), 200, "no-store")
	if next["total"] != float64(30) || len(items(t, next)) != 5 || next["next_cursor"] != nil {
		t.Fatalf("next %v", next)
	}
	for _, v := range items(t, next) {
		m := v.(map[string]any)
		if m["low_stock"] != true || m["available_quantity"] != float64(0) || m["min_price_amount"] != nil {
			data, _ := json.Marshal(m)
			t.Fatalf("empty variants %s", data)
		}
	}
	read(t, mux, c, path+"&search=changed&cursor="+url.QueryEscape(first["next_cursor"].(string)), 400, "no-store")
}
