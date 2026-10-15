package adapters

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"github.com/freedomCruz/monte-luna/backend/internal/catalog"
	"github.com/freedomCruz/monte-luna/backend/internal/invoicing"
	"github.com/freedomCruz/monte-luna/backend/internal/orders/domain"
	"github.com/freedomCruz/monte-luna/backend/internal/shipping"
)

type CatalogInventory interface {
	Allocate(context.Context, string, []catalog.StockRequest) ([]catalog.Allocation, error)
	Release(context.Context, string) error
}
type InventoryGateway struct{ Catalog CatalogInventory }

func (g InventoryGateway) Allocate(ctx context.Context, reference string, items []domain.Item) ([]domain.Allocation, error) {
	requests := make([]catalog.StockRequest, len(items))
	for i, item := range items {
		requests[i] = catalog.StockRequest{VariantID: strings.ToLower(item.VariantID), Quantity: item.Quantity}
	}
	rows, err := g.Catalog.Allocate(ctx, reference, requests)
	if err != nil {
		var shortage *catalog.InsufficientStockError
		var unavailable *catalog.VariantUnavailableError
		code, variant, status, field := "", "", 422, "variant_id"
		if errors.As(err, &shortage) {
			code, variant, status, field = "insufficient_stock", shortage.VariantID, 409, "quantity"
		} else if errors.As(err, &unavailable) {
			code, variant = "variant_unavailable", unavailable.VariantID
		}
		if code != "" {
			for i, item := range items {
				if strings.EqualFold(item.VariantID, variant) {
					return nil, domain.FieldProblem(status, code, fmt.Sprintf("items[%d].%s", i, field))
				}
			}
		}
		return nil, err
	}
	result := make([]domain.Allocation, 0, len(rows))
	for _, row := range rows {
		result = append(result, domain.Allocation{VariantID: row.VariantID, LotID: row.LotID, LotCode: row.LotCode, ProductionDate: row.ProductionDate, Quantity: row.Quantity})
	}
	return result, nil
}
func (g InventoryGateway) Release(ctx context.Context, reference string) error {
	return g.Catalog.Release(ctx, reference)
}

type AddressGateway struct{}

func (AddressGateway) LookupAddress(code string) (string, string, error) {
	place, err := shipping.LookupMunicipality(code)
	if err != nil {
		return "", "", domain.FieldProblem(422, "unknown_municipality", "shipping_address.municipality_code")
	}
	return place.DepartmentName, place.MunicipalityName, nil
}

type CatalogReader interface {
	CheckoutVariants(context.Context, []string) ([]catalog.CheckoutVariant, error)
}
type Gateways struct {
	Catalog  CatalogReader
	Shipping shipping.QuotePort
	Tax      invoicing.TaxCalculator
}

func (g Gateways) CheckoutVariants(ctx context.Context, ids []string) ([]domain.Variant, error) {
	rows, err := g.Catalog.CheckoutVariants(ctx, ids)
	if err != nil {
		return nil, err
	}
	result := make([]domain.Variant, 0, len(rows))
	for _, row := range rows {
		result = append(result, domain.Variant{ID: row.ID, ProductID: row.ProductID, ProductSlug: row.ProductSlug, ProductTitle: row.ProductTitle, VariantLabel: row.VariantLabel, SKU: row.SKU, PriceAmount: row.PriceAmount, Currency: row.Currency, ProductStatus: row.ProductStatus, Status: row.Status, WeightGrams: row.WeightGrams, TaxCategory: row.TaxCategory, AvailableStock: row.AvailableStock})
	}
	return result, nil
}
func (g Gateways) ShippingQuote(ctx context.Context, code string, weight int32, subtotal int64) (domain.QuoteShipping, error) {
	quote, err := g.Shipping.Quote(ctx, shipping.QuoteInput{MunicipalityCode: code, TotalWeightGrams: weight, OrderSubtotal: subtotal})
	if err != nil {
		var unknown *shipping.UnknownMunicipalityError
		var unsupported *shipping.UnsupportedDestinationError
		switch {
		case errors.As(err, &unknown):
			return domain.QuoteShipping{}, domain.FieldProblem(422, "unknown_municipality", "municipality_code")
		case errors.As(err, &unsupported):
			return domain.QuoteShipping{}, domain.FieldProblem(422, "unsupported_destination", "municipality_code")
		default:
			return domain.QuoteShipping{}, err
		}
	}
	return domain.QuoteShipping{
		Shipping: domain.Shipping{
			RateName:         quote.RateName,
			Amount:           quote.Amount,
			IsFreeShipping:   quote.FreeShipping,
			EstimatedDaysMin: quote.EstimatedDaysMin,
			EstimatedDaysMax: quote.EstimatedDaysMax,
		},
		RegularShippingAmount: quote.RegularAmount,
	}, nil
}
func (g Gateways) CalculateTax(ctx context.Context, lines []domain.TaxLine, code string) (domain.TaxResult, error) {
	request := invoicing.TaxRequest{MunicipalityCode: code, Lines: make([]invoicing.Line, 0, len(lines))}
	for _, line := range lines {
		request.Lines = append(request.Lines, invoicing.Line{Category: line.Category, BaseAmount: line.BaseAmount})
	}
	result, err := g.Tax.Calculate(ctx, request)
	if err != nil {
		return domain.TaxResult{}, err
	}
	tax := domain.TaxResult{Amount: result.TotalAmount, Profile: domain.FiscalProfile{Country: result.Profile.Country, LegalForm: result.Profile.LegalForm, TaxRegime: result.Profile.TaxRegime, VATResponsible: result.Profile.VATResponsible}, Lines: make([]domain.TaxSnapshot, 0, len(result.Lines))}
	for _, line := range result.Lines {
		tax.Lines = append(tax.Lines, domain.TaxSnapshot{Category: line.Category, Code: line.Code, BaseAmount: line.BaseAmount, RateBPS: line.RateBPS, Amount: line.Amount})
	}
	return tax, nil
}
