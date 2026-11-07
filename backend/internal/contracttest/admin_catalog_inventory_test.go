package contracttest_test

import (
	"encoding/json"
	"strings"
	"testing"

	"github.com/freedomCruz/monte-luna/backend/internal/contracttest"
)

func TestAdminCatalogInventoryReads(t *testing.T) {
	doc := contracttest.Load(t, "catalog.yaml").Doc()
	for _, tt := range []struct{ path, id, schema string }{
		{"/api/v1/admin/inventory/variants", "listAdminInventoryVariants", "AdminInventoryVariantPage"},
		{"/api/v1/admin/inventory/variants/{id}", "getAdminInventoryVariant", "AdminInventoryVariant"},
		{"/api/v1/admin/inventory/variants/{id}/lots", "listAdminVariantLots", "AdminVariantLotPage"},
		{"/api/v1/admin/inventory/variants/{id}/movements", "listAdminInventoryMovements", "AdminInventoryMovementPage"},
	} {
		t.Run(tt.id, func(t *testing.T) {
			item := doc.Paths.Find(tt.path)
			if item == nil || item.Get == nil || item.Get.OperationID != tt.id {
				t.Fatalf("missing %s", tt.id)
			}
			schema := item.Get.Responses.Value("200").Value.Content.Get("application/json").Schema
			if !strings.HasSuffix(schema.Ref, "/"+tt.schema) {
				t.Fatal("wrong success representation")
			}
			if strings.HasSuffix(tt.schema, "Page") {
				for _, field := range []string{"items", "next_cursor", "total", "generated_at"} {
					if !contains(schema.Value.Required, field) {
						t.Fatalf("missing %s", field)
					}
				}
			}
			if item.Get.Responses.Value("503") == nil {
				t.Fatal("composition failures must not fabricate zero counts")
			}
		})
	}
	for name, fields := range map[string][]string{
		"AdminInventoryVariant":  {"product_id", "variant_id", "product_title", "variant_label", "sku", "available_quantity", "reserved_quantity", "active_lot_count", "low_stock", "product_version", "generated_at"},
		"AdminVariantLot":        {"id", "product_id", "lot_code", "production_date", "expiration_date", "status", "quantity", "reserved_quantity", "old_roast", "next_to_allocate", "version"},
		"AdminInventoryMovement": {"id", "variant_id", "lot_id", "lot_code", "quantity_delta", "reason", "display_kind", "reference_id", "order", "actor_id", "actor_name", "note", "created_at"},
	} {
		ref := doc.Components.Schemas[name]
		if ref == nil {
			t.Fatalf("missing %s", name)
		}
		for _, field := range fields {
			if ref.Value.Properties[field] == nil || !contains(ref.Value.Required, field) {
				t.Fatalf("%s missing %s", name, field)
			}
		}
	}
}

func TestAdminInventoryMovementReasons(t *testing.T) {
	doc := contracttest.Load(t, "catalog.yaml").Doc()
	ref := doc.Components.Schemas["AdminInventoryMovement"]
	if ref == nil {
		t.Fatal("missing ledger schema")
	}
	const body = `{"id":"01946894-3d9a-7c98-b807-6c84c1762c2f","variant_id":"01946894-3d9a-7c98-b807-6c84c1762c2f","lot_id":"01946894-3d9a-7c98-b807-6c84c1762c2f","lot_code":"LOT-1","quantity_delta":-2,"reason":"sale","display_kind":"reservation","reference_id":"01946894-3d9a-7c98-b807-6c84c1762c2f","order":{"id":"01946894-3d9a-7c98-b807-6c84c1762c2f","order_number":"ORD-TEST","status":"pending_payment","reservation_state":"held"},"actor_id":null,"actor_name":null,"note":null,"created_at":"2026-11-06T12:00:00Z"}`
	var value map[string]any
	if err := json.Unmarshal([]byte(body), &value); err != nil {
		t.Fatal(err)
	}
	if err := ref.Value.VisitJSON(value); err != nil {
		t.Fatal(err)
	}
	for _, reason := range []string{"receipt", "sale", "return", "adjustment", "damage", "release"} {
		if err := ref.Value.Properties["reason"].Value.VisitJSON(reason); err != nil {
			t.Fatalf("canonical reason %s: %v", reason, err)
		}
	}
	value["reason"] = "reservation"
	if err := ref.Value.VisitJSON(value); err == nil {
		t.Fatal("reservation is a presentation kind, never a stored reason")
	}
	value["reason"], value["quantity_delta"] = "sale", float64(0)
	if err := ref.Value.VisitJSON(value); err == nil {
		t.Fatal("zero movement is invalid")
	}
}
