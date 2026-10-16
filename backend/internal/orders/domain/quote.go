// Package domain defines read-only checkout quote inputs, outputs and ports.
package domain

import (
	"context"
	"errors"
	"fmt"
	"math"
	"regexp"
	"strings"
)

type Item struct {
	VariantID string `json:"variant_id"`
	Quantity  int32  `json:"quantity"`
}
type QuoteRequest struct {
	Items            []Item `json:"items"`
	MunicipalityCode string `json:"municipality_code"`
}
type FieldError struct {
	Field   string `json:"field"`
	Code    string `json:"code"`
	Message string `json:"message"`
}
type Error struct {
	Status int
	Code   string
	Fields []FieldError
}

func (e *Error) Error() string { return e.Code }
func FieldProblem(status int, code, field string) *Error {
	return &Error{Status: status, Code: code, Fields: []FieldError{{Field: field, Code: code, Message: "The requested value is unavailable or invalid."}}}
}
func Validation(field, code string) *Error {
	e := FieldProblem(422, "validation_failed", field)
	e.Fields[0].Code = code
	return e
}
func ValidateRequest(request QuoteRequest) error {
	if len(request.Items) < 1 || len(request.Items) > 50 {
		return Validation("items", "invalid_length")
	}
	if !regexp.MustCompile(`^[0-9]{5}$`).MatchString(request.MunicipalityCode) {
		return Validation("municipality_code", "invalid_format")
	}
	seen := make(map[string]bool)
	for i, item := range request.Items {
		field := fmt.Sprintf("items[%d]", i)
		if !regexp.MustCompile(`(?i)^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`).MatchString(item.VariantID) {
			return Validation(field+".variant_id", "invalid_format")
		}
		normalized := strings.ToLower(item.VariantID)
		if seen[normalized] {
			return Validation(field+".variant_id", "duplicate_variant")
		}
		seen[normalized] = true
		if item.Quantity < 1 || item.Quantity > 99 {
			return Validation(field+".quantity", "out_of_range")
		}
	}
	return nil
}
func Multiply(amount int64, quantity int32) (int64, error) {
	if amount < 0 || quantity < 0 || (quantity > 0 && amount > math.MaxInt64/int64(quantity)) {
		return 0, errors.New("amount out of range")
	}
	return amount * int64(quantity), nil
}
func Add(a, b int64) (int64, error) {
	if a < 0 || b < 0 || a > math.MaxInt64-b {
		return 0, errors.New("total out of range")
	}
	return a + b, nil
}

type Variant struct {
	ID, ProductID, ProductSlug, ProductTitle, VariantLabel, SKU string
	PriceAmount                                                 int64
	Currency, ProductStatus, Status                             string
	WeightGrams                                                 int32
	TaxCategory                                                 string
	AvailableStock                                              int64
}
type Shipping struct {
	RateName         string `json:"rate_name"`
	Amount           int64  `json:"shipping_amount"`
	IsFreeShipping   bool   `json:"is_free_shipping"`
	EstimatedDaysMin int32  `json:"estimated_days_min"`
	EstimatedDaysMax int32  `json:"estimated_days_max"`
}
type QuoteShipping struct {
	Shipping
	RegularShippingAmount int64 `json:"regular_shipping_amount"`
}
type TaxLine struct {
	Category   string
	BaseAmount int64
}
type TaxSnapshot struct {
	Category, Code string
	BaseAmount     int64
	RateBPS        int32
	Amount         int64
}
type FiscalProfile struct {
	Country, LegalForm string
	TaxRegime          *string
	VATResponsible     bool
}
type TaxResult struct {
	Lines   []TaxSnapshot
	Amount  int64
	Profile FiscalProfile
}
type Line struct {
	VariantID       string      `json:"variant_id"`
	ProductSlug     string      `json:"product_slug"`
	ProductTitle    string      `json:"product_title"`
	VariantLabel    string      `json:"variant_label"`
	SKU             string      `json:"sku"`
	UnitPriceAmount int64       `json:"unit_price_amount"`
	Quantity        int32       `json:"quantity"`
	LineTotalAmount int64       `json:"line_total_amount"`
	ProductID       string      `json:"-"`
	WeightGrams     int32       `json:"-"`
	Tax             TaxSnapshot `json:"-"`
}
type Quote struct {
	Lines          []Line        `json:"lines"`
	Shipping       QuoteShipping `json:"shipping"`
	SubtotalAmount int64         `json:"subtotal_amount"`
	ShippingAmount int64         `json:"shipping_amount"`
	TaxAmount      int64         `json:"tax_amount"`
	TotalAmount    int64         `json:"total_amount"`
	FiscalProfile  FiscalProfile `json:"-"`
}
type CatalogPort interface {
	CheckoutVariants(context.Context, []string) ([]Variant, error)
}
type ShippingPort interface {
	ShippingQuote(context.Context, string, int32, int64) (QuoteShipping, error)
}
type TaxCalculator interface {
	CalculateTax(context.Context, []TaxLine, string) (TaxResult, error)
}
