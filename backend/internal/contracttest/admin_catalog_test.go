package contracttest_test

import (
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"

	"github.com/freedomCruz/monte-luna/backend/internal/contracttest"
)

// Pin the seven public operations AND every schema/header/parameter they use.
// Hashes are of the approved source, not git history; normalize checkout EOLs only.
func TestCatalogStorefrontUnchanged(t *testing.T) {
	_, file, _, _ := runtime.Caller(0)
	dir := filepath.Join(filepath.Dir(file), "..", "..", "..", "contracts", "openapi")
	read := func(name string) string {
		t.Helper()
		b, err := os.ReadFile(filepath.Join(dir, name))
		if err != nil {
			t.Fatal(err)
		}
		return strings.ReplaceAll(string(b), "\r\n", "\n")
	}
	s := read("catalog.yaml")
	for _, tt := range []struct{ name, start, end, hash string }{
		{"paths", "paths:\n", "  /api/v1/admin/products:\n", "d9c78b5ee42092aa03254a0715dc74c577895ad2690c68cca01db89426043c7b"},
		{"parameters", "  parameters:\n", "    AdminProductId:\n", "bda2864a6b05ebb2326fd6273350feff869af46cee69ddf0bb399608dd828b03"},
		{"headers", "  headers:\n", "    AdminNoStore:\n", "d7dd23d6a83250ffb321eac530fcd165b3dd4124fb0aa7ebf8b47aa951d03feb"},
		{"schemas", "  schemas:\n", "    AdminProductStatus:", "45c666a702ef7cb26e9189834acb52207a8cc0c3cd4777d52c3c853404ca381f"},
	} {
		t.Run(tt.name, func(t *testing.T) {
			a, b := strings.Index(s, "\n"+tt.start)+1, strings.Index(s, "\n"+tt.end)+1
			if a == 0 || b <= a {
				t.Fatal("missing storefront boundary")
			}
			if got := fmt.Sprintf("%x", sha256.Sum256([]byte(s[a:b]))); got != tt.hash {
				t.Fatalf("storefront %s changed: %s", tt.name, got)
			}
		})
	}
	if got := fmt.Sprintf("%x", sha256.Sum256([]byte(read("common.yaml")))); got != "277dfe3b3b32fb0c733f0d34e4db61344fdab87044f930e56503824c88441675" {
		t.Fatal("shared storefront components changed")
	}
	doc := contracttest.Load(t, "catalog.yaml").Doc()
	n := 0
	for path, item := range doc.Paths.Map() {
		if !strings.HasPrefix(path, "/api/v1/admin/") {
			n += len(item.Operations())
		}
	}
	if n != 7 {
		t.Fatalf("public operations = %d, want 7", n)
	}
}

func TestAdminCatalogReads(t *testing.T) {
	doc := contracttest.Load(t, "catalog.yaml").Doc()
	for _, tt := range []struct{ path, id string }{
		{"/api/v1/admin/products", "listAdminProducts"},
		{"/api/v1/admin/products/{id}", "getAdminProduct"},
		{"/api/v1/admin/catalog/categories", "listAdminCatalogCategories"},
		{"/api/v1/admin/catalog/origins", "listAdminCatalogOrigins"},
		{"/api/v1/admin/catalog/brands", "listAdminCatalogBrands"},
		{"/api/v1/admin/catalog/product-types", "listAdminCatalogProductTypes"},
	} {
		t.Run(tt.id, func(t *testing.T) {
			path := doc.Paths.Find(tt.path)
			if path == nil || path.Get == nil || path.Get.OperationID != tt.id {
				t.Fatalf("missing %s", tt.id)
			}
			if strings.Contains(tt.path, "/catalog/") && len(path.Operations()) != 1 {
				t.Fatal("taxonomy is read-only")
			}
		})
	}
	for path, item := range doc.Paths.Map() {
		if !strings.HasPrefix(path, "/api/v1/admin/") {
			continue
		}
		for _, op := range item.Operations() {
			if op.Security == nil || len(*op.Security) != 1 {
				t.Fatalf("%s lacks explicit session", path)
			}
			if _, ok := (*op.Security)[0]["adminSession"]; !ok {
				t.Fatal("adminSession missing")
			}
			roles, _ := json.Marshal(op.Extensions["x-roles"])
			if string(roles) != `["owner","staff"]` {
				t.Fatalf("roles: %s", roles)
			}
			for status, r := range op.Responses.Map() {
				cache := r.Value.Headers["Cache-Control"]
				if cache == nil || cache.Value.Schema.Value.Pattern != "^no-store$" {
					t.Fatalf("%s %s lacks no-store", path, status)
				}
				if status[0] != '2' && r.Value.Content.Get("application/problem+json") == nil {
					t.Fatalf("%s lacks RFC 9457", path)
				}
			}
			for _, status := range []string{"400", "401", "403", "422", "500"} {
				if op.Responses.Value(status) == nil {
					t.Fatalf("%s lacks %s", path, status)
				}
			}
		}
	}
	cookie := doc.Components.SecuritySchemes["adminSession"]
	if cookie == nil || cookie.Value.In != "cookie" || cookie.Value.Name != "__Host-session" {
		t.Fatal("shared session scheme missing")
	}
}

func TestAdminCatalogReadFields(t *testing.T) {
	doc := contracttest.Load(t, "catalog.yaml").Doc()
	for name, fields := range map[string][]string{
		"AdminProductRow":          {"id", "title", "slug", "product_type", "categories", "status", "variant_count", "min_price_amount", "max_price_amount", "available_quantity", "low_stock", "image_url", "version"},
		"AdminProduct":             {"id", "product_type", "brand", "origin", "categories", "title", "slug", "description", "status", "attributes", "variants", "images", "created_at", "updated_at", "version"},
		"AdminVariant":             {"id", "product_id", "sku", "barcode", "options", "attributes", "weight_grams", "price_amount", "compare_at_price_amount", "tax_category", "status", "available_quantity", "low_stock", "version"},
		"AdminAttributeDefinition": {"key", "label", "data_type", "scope", "is_variant_option", "is_required", "is_filterable", "allowed_values", "unit", "position"},
	} {
		ref := doc.Components.Schemas[name]
		if ref == nil {
			t.Fatalf("missing %s", name)
		}
		for _, field := range fields {
			if ref.Value.Properties[field] == nil || !contains(ref.Value.Required, field) {
				t.Errorf("%s missing required %s", name, field)
			}
		}
	}
	typeRef := doc.Components.Schemas["AdminProductType"]
	if typeRef == nil || typeRef.Value.Properties["status"] != nil {
		t.Fatal("product types have no status column")
	}
	for _, name := range []string{"AdminProductPage", "AdminCategoryPage", "AdminOriginPage", "AdminBrandPage", "AdminProductTypePage"} {
		ref := doc.Components.Schemas[name]
		if ref == nil {
			t.Fatalf("missing %s", name)
		}
		for _, field := range []string{"items", "next_cursor", "total"} {
			if !contains(ref.Value.Required, field) {
				t.Errorf("%s missing %s", name, field)
			}
		}
	}
}
