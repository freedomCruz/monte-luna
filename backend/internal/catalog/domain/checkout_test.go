package domain_test

import (
	"github.com/freedomCruz/monte-luna/backend/internal/catalog/domain"
	"testing"
)

func TestCheckoutVariantLabel(t *testing.T) {
	unit := "g"
	defs := []domain.Definition{{Key: "presentation", Scope: "variant", IsVariantOption: true, DataType: "option", Unit: &unit, Allowed: []domain.Option{{Value: "250_g", Label: "250"}}}, {Key: "grind", Scope: "variant", IsVariantOption: true, DataType: "option", Allowed: []domain.Option{{Value: "whole", Label: "Whole bean"}}}}
	label, err := domain.VariantLabel(defs, map[string]any{"presentation": "250_g", "grind": "whole"})
	if err != nil || label != "250 g / Whole bean" {
		t.Fatalf("label=%q err=%v", label, err)
	}
	if _, err := domain.VariantLabel(defs, map[string]any{"presentation": "250_g"}); err == nil {
		t.Fatal("missing axis accepted")
	}
}
