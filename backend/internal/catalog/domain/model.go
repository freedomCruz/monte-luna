// Package domain contains pure catalog read models and outbound ports.
package domain

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"
)

type Kind string

const (
	Products       Kind = "products"
	ProductDetail  Kind = "product"
	Origins        Kind = "origins"
	OriginDetail   Kind = "origin"
	OriginProducts Kind = "origin_products"
	Categories     Kind = "categories"
	Availabilities Kind = "availabilities"
)

type Request struct {
	Kind                                   Kind
	Slug                                   string
	Limit                                  int
	Cursor, Sort                           string
	Categories, ProductTypes, ProductSlugs []string
}
type Key struct {
	Slug      string     `json:"slug"`
	CreatedAt *time.Time `json:"created_at"`
	Position  *int32     `json:"position"`
	Name      *string    `json:"name"`
}
type Query struct {
	Request
	After Key
}
type Page[T any] struct {
	Items      []T     `json:"items"`
	NextCursor *string `json:"next_cursor"`
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

type NamedResource struct {
	Slug string `json:"slug"`
	Name string `json:"name"`
}
type Category struct {
	Slug       string  `json:"slug"`
	Name       string  `json:"name"`
	ParentSlug *string `json:"parent_slug"`
	Position   int32   `json:"position"`
}
type Image struct {
	URL        string `json:"url"`
	AltText    string `json:"alt_text"`
	StorageKey string `json:"-"`
}
type ProductImage struct {
	Image
	VariantID *string `json:"variant_id"`
}
type Option struct {
	Value string `json:"value"`
	Label string `json:"label"`
}
type Definition struct {
	Key, Label, DataType, Scope string
	Unit                        *string
	IsVariantOption             bool
	Allowed                     []Option
}
type Attribute struct {
	Key          string  `json:"key"`
	Label        string  `json:"label"`
	DataType     string  `json:"data_type"`
	Unit         *string `json:"unit"`
	Value        any     `json:"value"`
	DisplayValue *string `json:"display_value"`
}
type Variant struct {
	ID          string         `json:"id"`
	SKU         string         `json:"sku"`
	WeightGrams int32          `json:"weight_grams"`
	Options     []Attribute    `json:"options"`
	Values      map[string]any `json:"-"`
}
type OriginSummary struct {
	Slug         string `json:"slug"`
	Name         string `json:"name"`
	ProducerName string `json:"producer_name"`
}
type Product struct {
	Slug        string         `json:"slug"`
	Title       string         `json:"title"`
	Description *string        `json:"description"`
	CreatedAt   time.Time      `json:"created_at"`
	ProductType NamedResource  `json:"product_type"`
	Brand       *NamedResource `json:"brand"`
	Origin      *OriginSummary `json:"origin"`
	Categories  []Category     `json:"categories"`
	Images      []ProductImage `json:"images"`
	Attributes  []Attribute    `json:"attributes"`
	Variants    []Variant      `json:"variants"`
	Values      map[string]any `json:"-"`
	Definitions []Definition   `json:"-"`
}
type Origin struct {
	Slug             string  `json:"slug"`
	Name             string  `json:"name"`
	ProducerName     string  `json:"producer_name"`
	CountryCode      string  `json:"country_code"`
	Department       *string `json:"department"`
	MunicipalityCode *string `json:"municipality_code"`
	MunicipalityName *string `json:"municipality_name"`
	AltitudeMinMasl  *int32  `json:"altitude_min_masl"`
	AltitudeMaxMasl  *int32  `json:"altitude_max_masl"`
	Story            *string `json:"story"`
	Images           []Image `json:"images"`
}
type VariantAvailability struct {
	VariantID            string  `json:"variant_id"`
	PriceAmount          int64   `json:"price_amount"`
	CompareAtPriceAmount *int64  `json:"compare_at_price_amount"`
	Availability         string  `json:"availability"`
	ProductionDate       *string `json:"production_date"`
}
type ProductAvailability struct {
	ProductSlug string                `json:"product_slug"`
	Variants    []VariantAvailability `json:"variants"`
}
type Repository interface {
	Products(context.Context, Query) ([]Product, error)
	Origins(context.Context, Query) ([]Origin, error)
	Categories(context.Context, Query) ([]Category, error)
	Live(context.Context, Query) ([]ProductAvailability, error)
	OriginExists(context.Context, string) (bool, error)
}
type MediaStorePort interface {
	Resolve(context.Context, string) (string, error)
}

func Availability(stock int64, date *string) (string, *string) {
	if stock <= 0 {
		return "out_of_stock", nil
	}
	return "in_stock", date
}

// DisplayAttributes preserves definition order and explicit unknown values.
// Variant responses expose only variant axes, never unrelated product fields.
func DisplayAttributes(defs []Definition, values map[string]any, scope string) ([]Attribute, error) {
	result := make([]Attribute, 0)
	for _, d := range defs {
		if d.Scope != scope || (scope == "variant" && !d.IsVariantOption) {
			continue
		}
		value := values[d.Key]
		a := Attribute{Key: d.Key, Label: d.Label, DataType: d.DataType, Unit: d.Unit, Value: value}
		if value != nil {
			label, err := displayValue(d, value)
			if err != nil {
				return nil, fmt.Errorf("attribute %s: %w", d.Key, err)
			}
			a.DisplayValue = &label
		} else if scope == "variant" {
			return nil, fmt.Errorf("variant axis %s has no value", d.Key)
		}
		result = append(result, a)
	}
	return result, nil
}
func displayValue(d Definition, value any) (string, error) {
	label := func(key string) (string, error) {
		for _, o := range d.Allowed {
			if o.Value == key {
				return o.Label, nil
			}
		}
		return "", fmt.Errorf("unknown option value")
	}
	switch d.DataType {
	case "text":
		if s, ok := value.(string); ok {
			return s, nil
		}
	case "option":
		if s, ok := value.(string); ok {
			return label(s)
		}
	case "multi_option":
		if values, ok := value.([]any); ok {
			parts := make([]string, 0, len(values))
			for _, v := range values {
				s, ok := v.(string)
				if !ok {
					return "", fmt.Errorf("non-string option value")
				}
				text, err := label(s)
				if err != nil {
					return "", err
				}
				parts = append(parts, text)
			}
			return strings.Join(parts, ", "), nil
		}
	case "integer":
		if number, ok := value.(json.Number); ok {
			if _, err := number.Int64(); err == nil {
				return number.String(), nil
			}
		}
	case "decimal":
		if number, ok := value.(json.Number); ok {
			if _, err := number.Float64(); err == nil {
				return number.String(), nil
			}
		}
	case "boolean":
		if value, ok := value.(bool); ok {
			return fmt.Sprint(value), nil
		}
	}
	return "", fmt.Errorf("value does not match %s", d.DataType)
}
