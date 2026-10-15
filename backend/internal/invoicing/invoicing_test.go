package invoicing_test

import (
	"context"
	"github.com/freedomCruz/monte-luna/backend/internal/invoicing"
	"testing"
)

func TestDemoProfileAndSnapshotIsolation(t *testing.T) {
	demo, err := invoicing.NewDemo()
	if err != nil {
		t.Fatal(err)
	}
	result, err := demo.Calculate(t.Context(), invoicing.TaxRequest{MunicipalityCode: "11001", Lines: []invoicing.Line{{Category: "excluded", BaseAmount: 100}}})
	if err != nil || result.Profile.Country != "CO" || result.Profile.LegalForm != "natural_person" || result.Profile.VATResponsible || result.Profile.TaxRegime != nil {
		t.Fatalf("%+v/%v", result, err)
	}
	regime := "ordinary" // Test fixture only: production configuration never infers a regime.
	calculator, err := invoicing.New(invoicing.Profile{Country: "CO", TaxRegime: &regime})
	if err != nil {
		t.Fatal(err)
	}
	regime = "simple"
	first, err := calculator.Calculate(t.Context(), invoicing.TaxRequest{})
	if err != nil {
		t.Fatal(err)
	}
	if *first.Profile.TaxRegime != "ordinary" {
		t.Fatal("caller changed the configured profile")
	}
	*first.Profile.TaxRegime = "changed"
	second, err := calculator.Calculate(t.Context(), invoicing.TaxRequest{})
	if err != nil {
		t.Fatal(err)
	}
	if *second.Profile.TaxRegime != "ordinary" {
		t.Fatal("returned snapshot changed future calculations")
	}
	ctx, cancel := context.WithCancel(t.Context())
	cancel()
	if _, err := calculator.Calculate(ctx, invoicing.TaxRequest{}); err == nil {
		t.Fatal("cancellation ignored")
	}
}
