package domain_test

import (
	"errors"
	"github.com/freedomCruz/monte-luna/backend/internal/orders/domain"
	"testing"
)

const variantID = "0199c4e2-7a1b-7c3d-9e0f-1a2b3c4d5e6f"

func TestQuoteInputValidation(t *testing.T) {
	for _, tc := range []struct {
		name    string
		request domain.QuoteRequest
		field   string
	}{
		{"empty cart", domain.QuoteRequest{MunicipalityCode: "11001"}, "items"},
		{"municipality shape", domain.QuoteRequest{MunicipalityCode: "1100", Items: []domain.Item{{VariantID: variantID, Quantity: 1}}}, "municipality_code"},
		{"quantity lower", domain.QuoteRequest{MunicipalityCode: "11001", Items: []domain.Item{{VariantID: variantID, Quantity: 0}}}, "items[0].quantity"},
		{"quantity upper", domain.QuoteRequest{MunicipalityCode: "11001", Items: []domain.Item{{VariantID: variantID, Quantity: 100}}}, "items[0].quantity"},
		{"variant uuid", domain.QuoteRequest{MunicipalityCode: "11001", Items: []domain.Item{{VariantID: "not-a-uuid", Quantity: 1}}}, "items[0].variant_id"},
		{"duplicate variant", domain.QuoteRequest{MunicipalityCode: "11001", Items: []domain.Item{{VariantID: variantID, Quantity: 1}, {VariantID: variantID, Quantity: 2}}}, "items[1].variant_id"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			var known *domain.Error
			err := domain.ValidateRequest(tc.request)
			if !errors.As(err, &known) || known.Code != "validation_failed" || known.Fields[0].Field != tc.field {
				t.Fatalf("error=%+v", err)
			}
		})
	}
	if err := domain.ValidateRequest(domain.QuoteRequest{MunicipalityCode: "11001", Items: []domain.Item{{VariantID: variantID, Quantity: 99}}}); err != nil {
		t.Fatal(err)
	}
}
func TestCheckedAmounts(t *testing.T) {
	if amount, err := domain.Multiply(3800000, 2); err != nil || amount != 7600000 {
		t.Fatalf("%d/%v", amount, err)
	}
	if _, err := domain.Multiply(9223372036854775807, 2); err == nil {
		t.Fatal("overflow accepted")
	}
	if _, err := domain.Add(9223372036854775807, 1); err == nil {
		t.Fatal("total overflow accepted")
	}
}
