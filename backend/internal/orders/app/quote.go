// Package app composes catalog, shipping and tax ports without persistence.
package app

import (
	"context"
	"fmt"
	"math"
	"strings"

	"github.com/freedomCruz/monte-luna/backend/internal/orders/domain"
)

type Service struct {
	catalog  domain.CatalogPort
	shipping domain.ShippingPort
	tax      domain.TaxCalculator
}

func NewService(catalog domain.CatalogPort, shipping domain.ShippingPort, tax domain.TaxCalculator) *Service {
	return &Service{catalog: catalog, shipping: shipping, tax: tax}
}
func (s *Service) Quote(ctx context.Context, request domain.QuoteRequest) (domain.Quote, error) {
	if err := domain.ValidateRequest(request); err != nil {
		return domain.Quote{}, err
	}
	ids := make([]string, len(request.Items))
	for i, item := range request.Items {
		ids[i] = strings.ToLower(item.VariantID)
	}
	variants, err := s.catalog.CheckoutVariants(ctx, ids)
	if err != nil {
		return domain.Quote{}, fmt.Errorf("read checkout catalog: %w", err)
	}
	byID := make(map[string]domain.Variant, len(variants))
	for _, variant := range variants {
		byID[strings.ToLower(variant.ID)] = variant
	}
	quote := domain.Quote{Lines: make([]domain.Line, 0, len(request.Items))}
	taxes := make([]domain.TaxLine, 0, len(request.Items))
	var weight int64
	for i, item := range request.Items {
		field := fmt.Sprintf("items[%d]", i)
		variant, found := byID[ids[i]]
		if !found || variant.Status != "active" || variant.ProductStatus != "published" {
			return domain.Quote{}, domain.FieldProblem(422, "variant_unavailable", field+".variant_id")
		}
		if variant.AvailableStock < int64(item.Quantity) {
			return domain.Quote{}, domain.FieldProblem(409, "insufficient_stock", field+".quantity")
		}
		if variant.Currency != "COP" || variant.PriceAmount <= 0 || variant.WeightGrams <= 0 {
			return domain.Quote{}, fmt.Errorf("invalid catalog checkout values")
		}
		amount, err := domain.Multiply(variant.PriceAmount, item.Quantity)
		if err != nil {
			return domain.Quote{}, domain.Validation(field+".quantity", "out_of_range")
		}
		subtotal, err := domain.Add(quote.SubtotalAmount, amount)
		if err != nil {
			return domain.Quote{}, domain.Validation(field+".quantity", "out_of_range")
		}
		quote.SubtotalAmount = subtotal
		weight += int64(variant.WeightGrams) * int64(item.Quantity)
		if weight > math.MaxInt32 {
			return domain.Quote{}, domain.Validation(field+".quantity", "out_of_range")
		}
		quote.Lines = append(quote.Lines, domain.Line{VariantID: variant.ID, ProductID: variant.ProductID, ProductSlug: variant.ProductSlug, ProductTitle: variant.ProductTitle, VariantLabel: variant.VariantLabel, SKU: variant.SKU, UnitPriceAmount: variant.PriceAmount, Quantity: item.Quantity, LineTotalAmount: amount, WeightGrams: variant.WeightGrams})
		taxes = append(taxes, domain.TaxLine{Category: variant.TaxCategory, BaseAmount: amount})
	}
	quote.Shipping, err = s.shipping.ShippingQuote(ctx, request.MunicipalityCode, int32(weight), quote.SubtotalAmount)
	if err != nil {
		return domain.Quote{}, fmt.Errorf("resolve checkout shipping: %w", err)
	}
	tax, err := s.tax.CalculateTax(ctx, taxes, request.MunicipalityCode)
	if err != nil {
		return domain.Quote{}, fmt.Errorf("calculate checkout tax: %w", err)
	}
	if len(tax.Lines) != len(quote.Lines) {
		return domain.Quote{}, fmt.Errorf("tax result has inconsistent line count")
	}
	for i, line := range tax.Lines {
		quote.Lines[i].Tax = line
	}
	quote.FiscalProfile = tax.Profile
	quote.TaxAmount = tax.Amount
	quote.ShippingAmount = quote.Shipping.Amount
	total, err := domain.Add(quote.SubtotalAmount, quote.ShippingAmount)
	if err != nil {
		return domain.Quote{}, fmt.Errorf("invalid checkout shipping total: %w", err)
	}
	quote.TotalAmount, err = domain.Add(total, tax.Amount)
	if err != nil {
		return domain.Quote{}, fmt.Errorf("invalid checkout tax total: %w", err)
	}
	return quote, nil
}
