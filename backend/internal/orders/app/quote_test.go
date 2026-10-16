package app_test

import (
	"context"
	"errors"
	"github.com/freedomCruz/monte-luna/backend/internal/orders/app"
	"github.com/freedomCruz/monte-luna/backend/internal/orders/domain"
	"reflect"
	"testing"
)

const id = "0199c4e2-7a1b-7c3d-9e0f-1a2b3c4d5e6f"

type dependencies struct {
	calls    []string
	variant  domain.Variant
	missing  bool
	fail     string
	shipping domain.QuoteShipping
	weight   int32
	subtotal int64
}

func (d *dependencies) CheckoutVariants(_ context.Context, _ []string) ([]domain.Variant, error) {
	d.calls = append(d.calls, "catalog")
	if d.fail == "catalog" {
		return nil, errors.New("catalog offline")
	}
	if d.missing {
		return nil, nil
	}
	return []domain.Variant{d.variant}, nil
}
func (d *dependencies) ShippingQuote(_ context.Context, code string, weight int32, subtotal int64) (domain.QuoteShipping, error) {
	d.calls = append(d.calls, "shipping")
	d.weight, d.subtotal = weight, subtotal
	if d.fail == "shipping" {
		return domain.QuoteShipping{}, domain.FieldProblem(422, "unsupported_destination", "municipality_code")
	}
	return d.shipping, nil
}
func (d *dependencies) CalculateTax(_ context.Context, lines []domain.TaxLine, _ string) (domain.TaxResult, error) {
	d.calls = append(d.calls, "tax")
	if d.fail == "tax" {
		return domain.TaxResult{}, errors.New("tax policy unavailable")
	}
	result := domain.TaxResult{Lines: make([]domain.TaxSnapshot, len(lines))}
	for i, line := range lines {
		result.Lines[i] = domain.TaxSnapshot{Category: "excluded", BaseAmount: line.BaseAmount}
	}
	return result, nil
}
func fixture() *dependencies {
	return &dependencies{variant: domain.Variant{ID: id, ProductID: id, ProductSlug: "demo", ProductTitle: "Demo", VariantLabel: "250 g", SKU: "DEMO", PriceAmount: 3800000, Currency: "COP", ProductStatus: "published", Status: "active", WeightGrams: 250, TaxCategory: "excluded", AvailableStock: 5}, shipping: domain.QuoteShipping{Shipping: domain.Shipping{RateName: "Standard", Amount: 800000, EstimatedDaysMin: 3, EstimatedDaysMax: 5}, RegularShippingAmount: 800000}}
}
func TestQuoteComposesLivePorts(t *testing.T) {
	d := fixture()
	service := app.NewService(d, d, d)
	got, err := service.Quote(t.Context(), domain.QuoteRequest{MunicipalityCode: "11001", Items: []domain.Item{{VariantID: id, Quantity: 2}}})
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(d.calls, []string{"catalog", "shipping", "tax"}) || d.weight != 500 || d.subtotal != 7600000 {
		t.Fatalf("calls=%v weight=%d subtotal=%d", d.calls, d.weight, d.subtotal)
	}
	if got.SubtotalAmount != 7600000 || got.ShippingAmount != 800000 || got.TaxAmount != 0 || got.TotalAmount != 8400000 || got.Shipping.EstimatedDaysMin != 3 || got.Shipping.EstimatedDaysMax != 5 || got.Shipping.RegularShippingAmount != 800000 || len(got.Lines) != 1 || got.Lines[0].LineTotalAmount != 7600000 || got.Lines[0].ProductSlug != "demo" {
		t.Fatalf("quote=%+v", got)
	}
	d.variant.PriceAmount = 3900000
	d.shipping.Amount = 0
	d.shipping.IsFreeShipping = true
	d.shipping.RegularShippingAmount = 800000
	second, err := service.Quote(t.Context(), domain.QuoteRequest{MunicipalityCode: "11001", Items: []domain.Item{{VariantID: id, Quantity: 2}}})
	if err != nil || second.TotalAmount != 7800000 || !second.Shipping.IsFreeShipping || second.Shipping.RegularShippingAmount != 800000 {
		t.Fatalf("stale quote=%+v/%v", second, err)
	}
}
func TestQuoteFailures(t *testing.T) {
	for _, tc := range []struct {
		name        string
		change      func(*dependencies)
		code, field string
	}{
		{"missing variant", func(d *dependencies) { d.missing = true }, "variant_unavailable", "items[0].variant_id"},
		{"archived variant", func(d *dependencies) { d.variant.Status = "archived" }, "variant_unavailable", "items[0].variant_id"},
		{"draft product", func(d *dependencies) { d.variant.ProductStatus = "draft" }, "variant_unavailable", "items[0].variant_id"},
		{"archived product", func(d *dependencies) { d.variant.ProductStatus = "archived" }, "variant_unavailable", "items[0].variant_id"},
		{"stock", func(d *dependencies) { d.variant.AvailableStock = 1 }, "insufficient_stock", "items[0].quantity"},
		{"price overflow", func(d *dependencies) { d.variant.PriceAmount = 9223372036854775807 }, "validation_failed", "items[0].quantity"},
		{"weight overflow", func(d *dependencies) { d.variant.WeightGrams = 2147483647 }, "validation_failed", "items[0].quantity"},
		{"destination", func(d *dependencies) { d.fail = "shipping" }, "unsupported_destination", "municipality_code"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			d := fixture()
			tc.change(d)
			_, err := app.NewService(d, d, d).Quote(t.Context(), domain.QuoteRequest{MunicipalityCode: "11001", Items: []domain.Item{{VariantID: id, Quantity: 2}}})
			var known *domain.Error
			if !errors.As(err, &known) || known.Code != tc.code || known.Fields[0].Field != tc.field {
				t.Fatalf("error=%+v", err)
			}
		})
	}
	for _, port := range []string{"catalog", "tax"} {
		t.Run(port, func(t *testing.T) {
			d := fixture()
			d.fail = port
			if _, err := app.NewService(d, d, d).Quote(t.Context(), domain.QuoteRequest{MunicipalityCode: "11001", Items: []domain.Item{{VariantID: id, Quantity: 1}}}); err == nil {
				t.Fatal("port failure ignored")
			}
		})
	}
	d := fixture()
	_, err := app.NewService(d, d, d).Quote(t.Context(), domain.QuoteRequest{})
	if err == nil || len(d.calls) != 0 {
		t.Fatalf("invalid request called dependencies: %v/%v", d.calls, err)
	}
}
