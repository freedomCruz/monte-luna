package domain_test

import (
	"github.com/freedomCruz/monte-luna/backend/internal/invoicing/domain"
	"testing"
)

func TestScenarioA(t *testing.T) {
	for _, category := range []string{"excluded", "exempt", "reduced", "standard"} {
		t.Run(category, func(t *testing.T) {
			result, err := domain.Calculate(domain.Profile{Country: "CO", LegalForm: "natural_person"}, []domain.Line{{Category: category, BaseAmount: 3800000}})
			if err != nil || result.TotalAmount != 0 || len(result.Lines) != 1 || result.Lines[0].Amount != 0 || result.Lines[0].RateBPS != 0 || result.Lines[0].Category != "excluded" || result.Lines[0].BaseAmount != 3800000 {
				t.Fatalf("%+v / %v", result, err)
			}
		})
	}
	for _, tc := range []struct {
		name    string
		profile domain.Profile
		line    domain.Line
	}{
		{"VAT-responsible policy unavailable", domain.Profile{Country: "CO", VATResponsible: true}, domain.Line{Category: "standard", BaseAmount: 100}},
		{"unknown category", domain.Profile{Country: "CO"}, domain.Line{Category: "unknown", BaseAmount: 100}},
		{"negative base", domain.Profile{Country: "CO"}, domain.Line{Category: "excluded", BaseAmount: -1}},
		{"unsupported country", domain.Profile{Country: "XX"}, domain.Line{Category: "excluded", BaseAmount: 100}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			if _, err := domain.Calculate(tc.profile, []domain.Line{tc.line}); err == nil {
				t.Fatal("unsupported request accepted")
			}
		})
	}
}
