package domain_test

import (
	"encoding/base64"
	"errors"
	"github.com/freedomCruz/monte-luna/backend/internal/orders/domain"
	"strings"
	"testing"
)

func validPlacement() domain.PlaceRequest {
	return domain.PlaceRequest{Items: []domain.Item{{VariantID: variantID, Quantity: 1}}, Customer: domain.Customer{Email: "Buyer@example.com", FullName: "Demo Buyer"}, Address: domain.Address{RecipientName: "Demo Recipient", RecipientPhone: "3001234567", MunicipalityCode: "11001", AddressLine1: "Calle 5 # 12-34"}, AcceptsDataPolicy: true}
}
func TestPlacementValidation(t *testing.T) {
	for _, tc := range []struct {
		name, field string
		change      func(*domain.PlaceRequest)
	}{
		{"email", "customer.email", func(r *domain.PlaceRequest) { r.Customer.Email = "invalid" }},
		{"buyer name", "customer.full_name", func(r *domain.PlaceRequest) { r.Customer.FullName = "a" }},
		{"recipient phone", "shipping_address.recipient_phone", func(r *domain.PlaceRequest) { r.Address.RecipientPhone = "123" }},
		{"address", "shipping_address.address_line1", func(r *domain.PlaceRequest) { r.Address.AddressLine1 = "x" }},
		{"consent", "accepts_data_policy", func(r *domain.PlaceRequest) { r.AcceptsDataPolicy = false }},
		{"natural NIT", "fiscal_data.document_type", func(r *domain.PlaceRequest) {
			r.Fiscal = &domain.FiscalData{PersonType: "natural", DocumentType: "NIT", DocumentNumber: "1234"}
		}},
		{"legal CC", "fiscal_data.document_type", func(r *domain.PlaceRequest) {
			r.Fiscal = &domain.FiscalData{PersonType: "legal", DocumentType: "CC", DocumentNumber: "1234"}
		}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			r := validPlacement()
			tc.change(&r)
			var known *domain.Error
			if err := domain.ValidatePlacement(r); !errors.As(err, &known) || known.Fields[0].Field != tc.field {
				t.Fatalf("error=%v", err)
			}
		})
	}
	for _, person := range []string{"CC", "CE", "PP", "NIT"} {
		r := validPlacement()
		kind := "natural"
		if person == "NIT" {
			kind = "legal"
		}
		r.Fiscal = &domain.FiscalData{PersonType: kind, DocumentType: person, DocumentNumber: "1234"}
		if err := domain.ValidatePlacement(r); err != nil {
			t.Fatal(err)
		}
	}
	if key, err := domain.NormalizeKey("0199C4E2-7A1B-7C3D-9E0F-1A2B3C4D5E6F"); err != nil || key != variantID {
		t.Fatalf("key=%s/%v", key, err)
	}
	if _, err := domain.NormalizeKey("invalid"); err == nil {
		t.Fatal("invalid idempotency key accepted")
	}
}
func TestDerivedTokenAndCanonicalRequest(t *testing.T) {
	secret := []byte(strings.Repeat("x", 32))
	token := domain.TrackingToken(secret, variantID)
	raw, err := base64.RawURLEncoding.DecodeString(token)
	if err != nil || len(raw) != 32 || len(token) != 43 {
		t.Fatalf("token shape %d/%v", len(raw), err)
	}
	if token != domain.TrackingToken(secret, strings.ToUpper(variantID)) {
		t.Fatal("UUID case changed token")
	}
	if token == domain.TrackingToken([]byte(strings.Repeat("y", 32)), variantID) {
		t.Fatal("secret did not affect token")
	}
	if len(domain.TokenHash(token)) != 64 || domain.TokenHash(token) == token {
		t.Fatal("invalid token hash")
	}
	request := validPlacement()
	hash, err := domain.RequestHash(request)
	if err != nil {
		t.Fatal(err)
	}
	request.Customer.FullName = "Other Buyer"
	second, err := domain.RequestHash(request)
	if err != nil || hash == second {
		t.Fatal("body mismatch not detected")
	}
}
