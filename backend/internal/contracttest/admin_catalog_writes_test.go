package contracttest_test

import (
	"encoding/json"
	"testing"

	"github.com/freedomCruz/monte-luna/backend/internal/contracttest"
)

func TestAdminCatalogProductWrites(t *testing.T) {
	doc := contracttest.Load(t, "catalog.yaml").Doc()
	for _, tt := range []struct {
		method, path, id, status string
		guarded                  bool
	}{
		{"POST", "/api/v1/admin/products", "createAdminProduct", "201", false},
		{"PATCH", "/api/v1/admin/products/{id}", "updateAdminProduct", "200", true},
		{"POST", "/api/v1/admin/products/{id}/variants", "createAdminVariant", "201", true},
		{"PATCH", "/api/v1/admin/products/{id}/variants/{variant_id}", "updateAdminVariant", "200", true},
	} {
		t.Run(tt.id, func(t *testing.T) {
			item := doc.Paths.Find(tt.path)
			if item == nil {
				t.Fatalf("missing path %s", tt.path)
			}
			op := item.GetOperation(tt.method)
			if op == nil || op.OperationID != tt.id {
				t.Fatalf("missing %s", tt.id)
			}
			response := op.Responses.Value(tt.status)
			if response == nil || response.Value.Headers["ETag"] == nil {
				t.Fatal("success must return parent strong ETag")
			}
			if tt.status == "201" && response.Value.Headers["Location"] == nil {
				t.Fatal("creation must return Location")
			}
			guarded := false
			for _, p := range op.Parameters {
				if p.Value.Name == "If-Match" {
					guarded = p.Value.Required && p.Value.Schema.Value.Pattern == `^"[1-9][0-9]*"$`
				}
			}
			if guarded != tt.guarded {
				t.Fatalf("guarded = %v", guarded)
			}
			if tt.guarded {
				for _, status := range []string{"412", "428"} {
					if op.Responses.Value(status) == nil {
						t.Fatalf("missing %s", status)
					}
				}
			}
			if op.Responses.Value("409") == nil {
				t.Fatal("uniqueness conflicts must be explicit")
			}
		})
	}
	item := doc.Paths.Find("/api/v1/admin/products/{id}/variants/{variant_id}")
	if item == nil || item.Get == nil || item.Get.OperationID != "getAdminVariant" {
		t.Fatal("created variant Location must be readable")
	}
}

func TestAdminCatalogWriteSchemas(t *testing.T) {
	doc := contracttest.Load(t, "catalog.yaml").Doc()
	for _, tt := range []struct {
		schema, body string
		invalid      bool
	}{
		{"AdminCreateProduct", `{"product_type_id":"01946894-3d9a-7c98-b807-6c84c1762c2f","title":"Coffee","slug":"coffee","attributes":{}}`, false},
		{"AdminCreateProduct", `{"title":"Coffee","slug":"coffee","attributes":{}}`, true},
		{"AdminCreateProduct", `{"product_type_id":"01946894-3d9a-7c98-b807-6c84c1762c2f","title":" ","slug":"coffee","attributes":{}}`, true},
		{"AdminPatchProduct", `{"description":null,"brand_id":null,"origin_id":null,"category_ids":[]}`, false},
		{"AdminPatchProduct", `{"status":"archived"}`, false},
		{"AdminPatchProduct", `{"attributes":{"optional_field":null}}`, false},
		{"AdminPatchProduct", `{"images":[{"id":"01946894-3d9a-7c98-b807-6c84c1762c2f","alt_text":"Coffee bag","variant_id":null,"position":0}]}`, false},
		{"AdminPatchProduct", `{"title":null}`, true},
		{"AdminPatchProduct", `{"product_type_id":"01946894-3d9a-7c98-b807-6c84c1762c2f"}`, true},
		{"AdminPatchProduct", `{"origin":{"country_code":"CO"}}`, true},
		{"AdminPatchProduct", `{"images":[{"storage_key":"client/key"}]}`, true},
		{"AdminCreateVariant", `{"sku":"SKU-1","options":{"presentation":"250g","grind":"whole_bean"},"attributes":{},"price_amount":3800000,"weight_grams":250,"tax_category":"excluded"}`, false},
		{"AdminCreateVariant", `{"sku":"SKU-1","options":{},"attributes":{},"price_amount":0,"weight_grams":250,"tax_category":"excluded"}`, true},
		{"AdminCreateVariant", `{"sku":"SKU-1","options":{},"attributes":{},"price_amount":1,"weight_grams":0,"tax_category":"excluded"}`, true},
		{"AdminCreateVariant", `{"sku":"SKU-1","options":{},"attributes":{},"price_amount":1,"weight_grams":250}`, true},
		{"AdminPatchVariant", `{"compare_at_price_amount":null,"barcode":null,"options":{"grind":"fine"}}`, false},
		{"AdminPatchVariant", `{"quantity":100}`, true},
		{"AdminPatchVariant", `{"price_amount":0}`, true},
		{"AdminPatchVariant", `{"price_amount":1.5}`, true},
		{"AdminPatchVariant", `{"tax_category":"unknown"}`, true},
		{"AdminPatchVariant", `{"currency":"USD"}`, true},
	} {
		t.Run(tt.schema+tt.body, func(t *testing.T) {
			ref := doc.Components.Schemas[tt.schema]
			if ref == nil {
				t.Fatalf("missing %s", tt.schema)
			}
			var value any
			if err := json.Unmarshal([]byte(tt.body), &value); err != nil {
				t.Fatal(err)
			}
			if err := ref.Value.VisitJSON(value); (err != nil) != tt.invalid {
				t.Fatalf("invalid=%v: %v", tt.invalid, err)
			}
		})
	}
}
