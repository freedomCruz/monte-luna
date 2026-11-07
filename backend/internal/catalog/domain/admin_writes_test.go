package domain

import (
	"encoding/json"
	"testing"
)

func TestAdminWriteAttributes(t *testing.T) {
	defs := []AdminDefinition{{Key: "roast", DataType: "option", Scope: "product", IsRequired: true, AllowedValues: []Option{{Value: "medium"}}}, {Key: "grind", DataType: "option", Scope: "variant", IsVariantOption: true, IsRequired: true, AllowedValues: []Option{{Value: "whole"}}}, {Key: "score", DataType: "decimal", Scope: "product"}, {Key: "count", DataType: "integer", Scope: "product"}, {Key: "organic", DataType: "boolean", Scope: "product"}, {Key: "notes", DataType: "text", Scope: "product"}, {Key: "varieties", DataType: "multi_option", Scope: "product", AllowedValues: []Option{{Value: "arabica"}}}}
	for _, tt := range []struct {
		name, scope string
		axes        bool
		values      map[string]any
		ok          bool
	}{
		{"valid product", "product", false, map[string]any{"roast": "medium", "score": json.Number("85.5"), "count": json.Number("1"), "organic": true, "notes": "fruit", "varieties": []any{"arabica"}}, true},
		{"required missing", "product", false, map[string]any{}, false},
		{"unknown option", "variant", true, map[string]any{"grind": "fine"}, false},
		{"undefined axis", "variant", true, map[string]any{"roast": "medium", "grind": "whole"}, false},
		{"valid axis", "variant", true, map[string]any{"grind": "whole"}, true},
		{"wrong type", "product", false, map[string]any{"roast": "medium", "count": json.Number("1.5")}, false},
		{"fraction beyond float precision", "product", false, map[string]any{"roast": "medium", "count": json.Number("9007199254740992.1")}, false},
		{"wrong boolean", "product", false, map[string]any{"roast": "medium", "organic": "true"}, false},
		{"wrong multi", "product", false, map[string]any{"roast": "medium", "varieties": []any{"robusta"}}, false},
	} {
		t.Run(tt.name, func(t *testing.T) {
			err := ValidateAdminAttributes(defs, tt.values, tt.scope, tt.axes)
			if (err == nil) != tt.ok {
				t.Fatalf("%v", err)
			}
		})
	}
}
func TestAdminVariantPriceBoundary(t *testing.T) {
	for _, tt := range []struct {
		price, compare int64
		ok             bool
	}{{100, 101, true}, {100, 100, false}, {100, 99, false}, {0, 1, false}} {
		v := AdminVariant{SKU: "sku", Options: map[string]any{}, Attributes: map[string]any{}, PriceAmount: tt.price, CompareAtPriceAmount: &tt.compare, WeightGrams: 1, TaxCategory: "excluded", Status: "active"}
		if err := ValidateAdminVariant(v, nil); (err == nil) != tt.ok {
			t.Fatalf("%+v: %v", tt, err)
		}
	}
}
func TestAdminReceiptBoundary(t *testing.T) {
	for _, tt := range []struct {
		quantity     int32
		date, expiry string
		ok           bool
	}{{1, "2026-01-01", "2026-01-01", true}, {0, "2026-01-01", "", false}, {-1, "2026-01-01", "", false}, {1, "2026-01-02", "2026-01-01", false}, {1, "invalid", "", false}} {
		in := AdminReceiveLot{LotCode: " lot ", ProductionDate: tt.date, Quantity: tt.quantity}
		if tt.expiry != "" {
			in.ExpirationDate = &tt.expiry
		}
		if err := in.Validate(); (err == nil) != tt.ok {
			t.Fatalf("%+v: %v", tt, err)
		}
	}
}
func TestAdminOriginFormats(t *testing.T) {
	min, max := int32(100), int32(99)
	bad := "1234"
	for _, o := range []AdminOrigin{{CountryCode: "co"}, {CountryCode: "CO", MunicipalityCode: &bad}, {CountryCode: "CO", AltitudeMinMasl: &min, AltitudeMaxMasl: &max}} {
		if ValidateAdminOrigin(o) == nil {
			t.Fatalf("accepted %+v", o)
		}
	}
	if err := ValidateAdminOrigin(AdminOrigin{CountryCode: "CO"}); err != nil {
		t.Fatal(err)
	}
}
func TestAdminImageEditShape(t *testing.T) {
	for _, body := range []string{
		`{"images":[{"id":"id","alt_text":"text","position":0}]}`,
		`{"images":[{"id":"id","alt_text":"text","variant_id":null}]}`,
		`{"images":[{"id":"id","alt_text":"text","variant_id":null,"position":0,"url":"https://example.com"}]}`,
	} {
		var fields map[string]json.RawMessage
		if err := json.Unmarshal([]byte(body), &fields); err != nil {
			t.Fatal(err)
		}
		if err := ValidateAdminWrite(AdminWrite{Kind: "update-product", Version: 1, Fields: fields}); err == nil {
			t.Fatalf("accepted %s", body)
		}
	}
}

func TestAdminMergePatch(t *testing.T) {
	base := map[string]any{"required": "old", "optional": "old"}
	out := MergeAdminAttributes(base, map[string]any{"optional": nil, "new": "value"})
	if out["required"] != "old" || out["optional"] != nil || out["new"] != "value" || base["optional"] != "old" {
		t.Fatalf("merged %+v base %+v", out, base)
	}
}
