package domain_test

import (
	"reflect"
	"testing"

	"github.com/freedomCruz/monte-luna/backend/internal/catalog/domain"
)

func TestAvailability(t *testing.T) {
	date := "2026-10-01"
	for _, tc := range []struct {
		name     string
		stock    int64
		date     *string
		want     string
		wantDate *string
	}{
		{"available", 5, &date, "in_stock", &date},
		{"empty", 0, nil, "out_of_stock", nil},
		{"empty_ignores_stale_date", 0, &date, "out_of_stock", nil},
	} {
		t.Run(tc.name, func(t *testing.T) {
			got, next := domain.Availability(tc.stock, tc.date)
			if got != tc.want || !reflect.DeepEqual(next, tc.wantDate) {
				t.Fatalf("availability/date=%s/%v, want %s/%v", got, next, tc.want, tc.wantDate)
			}
		})
	}
}

func TestDisplayAttributes(t *testing.T) {
	unit := "g"
	defs := []domain.Definition{
		{Key: "roast_level", Label: "Roast level", DataType: "option", Scope: "product", Allowed: []domain.Option{{Value: "medium", Label: "Medium"}}},
		{Key: "varieties", Label: "Varieties", DataType: "multi_option", Scope: "product", Allowed: []domain.Option{{Value: "geisha", Label: "Geisha"}, {Value: "bourbon", Label: "Bourbon"}}},
		{Key: "cupping_score", Label: "Cupping score", DataType: "decimal", Scope: "product"},
		{Key: "presentation", Label: "Presentation", DataType: "option", Scope: "variant", IsVariantOption: true, Unit: &unit, Allowed: []domain.Option{{Value: "250_g", Label: "250"}}},
	}
	for _, tc := range []struct {
		name, scope  string
		values       map[string]any
		keys, labels []string
	}{
		{"product_scope", "product", map[string]any{"roast_level": "medium", "varieties": []any{"geisha", "bourbon"}}, []string{"roast_level", "varieties", "cupping_score"}, []string{"Medium", "Geisha, Bourbon", ""}},
		{"variant_axis", "variant", map[string]any{"presentation": "250_g", "roast_level": "medium"}, []string{"presentation"}, []string{"250"}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			attrs, err := domain.DisplayAttributes(defs, tc.values, tc.scope)
			if err != nil {
				t.Fatal(err)
			}
			if len(attrs) != len(tc.keys) {
				t.Fatalf("attribute count=%d", len(attrs))
			}
			for i, a := range attrs {
				if a.Key != tc.keys[i] {
					t.Errorf("key=%s", a.Key)
				}
				if tc.labels[i] == "" {
					if a.Value != nil || a.DisplayValue != nil {
						t.Error("unknown value must remain null")
					}
				} else if a.DisplayValue == nil || *a.DisplayValue != tc.labels[i] {
					t.Errorf("display=%v", a.DisplayValue)
				}
			}
			if tc.scope == "variant" && (attrs[0].Unit == nil || *attrs[0].Unit != "g") {
				t.Error("unit was lost")
			}
		})
	}
}
