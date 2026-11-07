package domain

import (
	"context"
	"encoding/json"
	"math"
	"regexp"
	"slices"
	"strconv"
	"strings"
	"time"
)

// AdminWrite carries a presence-aware merge patch, never a client stock total.
// The repository validates the complete resulting document under the parent lock.
type AdminWrite struct {
	Kind, ProductID, VariantID, ActorID string
	Version                             int32
	Fields                              map[string]json.RawMessage
}
type AdminWriteResult struct {
	Product        *AdminProduct
	Variant        *AdminVariant
	Receipt        *AdminLotReceipt
	ProductVersion int32
}
type AdminWriteRepository interface {
	WriteAdmin(context.Context, AdminWrite) (AdminWriteResult, error)
}
type AdminReceiveLot struct {
	LotCode        string  `json:"lot_code"`
	ProductionDate string  `json:"production_date"`
	ExpirationDate *string `json:"expiration_date"`
	Quantity       int32   `json:"quantity"`
	Note           *string `json:"note"`
}
type AdminLotReceipt struct {
	ProductID        string `json:"product_id"`
	ProductVersion   int32  `json:"product_version"`
	VariantID        string `json:"variant_id"`
	LotID            string `json:"lot_id"`
	LotCode          string `json:"lot_code"`
	LotCreated       bool   `json:"lot_created"`
	MovementID       string `json:"movement_id"`
	Reason           string `json:"reason"`
	QuantityReceived int32  `json:"quantity_received"`
	QuantityAfter    int32  `json:"quantity_after"`
}

func AdminInvalid(field string) error {
	return &Error{Status: 422, Code: "validation_failed", Fields: []FieldError{{Field: field, Code: "invalid_parameter", Message: "Invalid value."}}}
}
func MergeAdminAttributes(base, patch map[string]any) map[string]any {
	out := make(map[string]any, len(base)+len(patch))
	for k, v := range base {
		out[k] = v
	}
	for k, v := range patch {
		if v == nil {
			delete(out, k)
		} else {
			out[k] = v
		}
	}
	return out
}
func ValidateAdminAttributes(defs []AdminDefinition, values map[string]any, scope string, axes bool) error {
	allowed := map[string]AdminDefinition{}
	for _, d := range defs {
		if d.Scope == scope && (scope != "variant" || d.IsVariantOption == axes) {
			allowed[d.Key] = d
			if d.IsRequired && values[d.Key] == nil {
				return AdminInvalid(d.Key)
			}
		}
	}
	for k, v := range values {
		d, ok := allowed[k]
		if !ok || v == nil {
			return AdminInvalid(k)
		}
		valid := false
		option := func(value string) bool {
			for _, o := range d.AllowedValues {
				if o.Value == value {
					return true
				}
			}
			return false
		}
		switch d.DataType {
		case "text":
			_, valid = v.(string)
		case "boolean":
			_, valid = v.(bool)
		case "integer", "decimal":
			var n float64
			switch x := v.(type) {
			case json.Number:
				var err error
				n, err = x.Float64()
				valid = err == nil
			case float64:
				n = x
				valid = true
			case int:
				n = float64(x)
				valid = true
			}
			valid = valid && !math.IsNaN(n) && !math.IsInf(n, 0) && (d.DataType != "integer" || math.Trunc(n) == n)
			if number, ok := v.(json.Number); ok && d.DataType == "integer" {
				valid = valid && adminInteger(string(number))
			}
		case "option":
			s, ok := v.(string)
			valid = ok && option(s)
		case "multi_option":
			values, ok := v.([]any)
			valid = ok
			for _, item := range values {
				s, ok := item.(string)
				if !ok || !option(s) {
					valid = false
				}
			}
		}
		if !valid {
			return AdminInvalid(k)
		}
	}
	return nil
}

// Test integrality without converting through float64 or expanding exponents.
func adminInteger(number string) bool {
	mantissa, exponent, hasExponent := strings.Cut(strings.ToLower(number), "e")
	whole, fraction, _ := strings.Cut(mantissa, ".")
	digits := strings.TrimLeft(strings.TrimPrefix(whole, "-")+fraction, "0")
	if digits == "" {
		return true
	}
	trailing := len(digits) - len(strings.TrimRight(digits, "0"))
	required := int64(len(fraction) - trailing)
	if !hasExponent {
		return required <= 0
	}
	exp, err := strconv.ParseInt(exponent, 10, 64)
	if err != nil {
		return !strings.HasPrefix(exponent, "-")
	}
	return exp >= required
}

func ValidateAdminVariant(v AdminVariant, defs []AdminDefinition) error {
	if strings.TrimSpace(v.SKU) == "" {
		return AdminInvalid("sku")
	}
	if v.PriceAmount <= 0 {
		return AdminInvalid("price_amount")
	}
	if v.CompareAtPriceAmount != nil && *v.CompareAtPriceAmount <= v.PriceAmount {
		return AdminInvalid("compare_at_price_amount")
	}
	if v.WeightGrams <= 0 {
		return AdminInvalid("weight_grams")
	}
	for _, n := range []*int32{v.LengthMM, v.WidthMM, v.HeightMM} {
		if n != nil && *n <= 0 {
			return AdminInvalid("dimensions")
		}
	}
	if !slices.Contains([]string{"excluded", "exempt", "reduced", "standard"}, v.TaxCategory) {
		return AdminInvalid("tax_category")
	}
	if !slices.Contains([]string{"active", "archived"}, v.Status) {
		return AdminInvalid("status")
	}
	if err := ValidateAdminAttributes(defs, v.Options, "variant", true); err != nil {
		return err
	}
	return ValidateAdminAttributes(defs, v.Attributes, "variant", false)
}
func ValidateAdminProduct(p AdminProduct) error {
	if strings.TrimSpace(p.Title) == "" {
		return AdminInvalid("title")
	}
	if ok, _ := regexp.MatchString(`^[a-z0-9]+(-[a-z0-9]+)*$`, p.Slug); !ok {
		return AdminInvalid("slug")
	}
	if !slices.Contains([]string{"draft", "published", "archived"}, p.Status) {
		return AdminInvalid("status")
	}
	if p.Origin != nil {
		if err := ValidateAdminOrigin(*p.Origin); err != nil {
			return err
		}
	}
	return ValidateAdminAttributes(p.ProductType.Definitions, p.Attributes, "product", false)
}
func ValidateAdminOrigin(o AdminOrigin) error {
	if ok, _ := regexp.MatchString(`^[A-Z]{2}$`, o.CountryCode); !ok {
		return AdminInvalid("origin_id")
	}
	if o.MunicipalityCode != nil {
		if ok, _ := regexp.MatchString(`^[0-9]{5}$`, *o.MunicipalityCode); !ok {
			return AdminInvalid("origin_id")
		}
	}
	for _, n := range []*int32{o.AltitudeMinMasl, o.AltitudeMaxMasl} {
		if n != nil && *n <= 0 {
			return AdminInvalid("origin_id")
		}
	}
	if o.AltitudeMinMasl != nil && o.AltitudeMaxMasl != nil && *o.AltitudeMaxMasl < *o.AltitudeMinMasl {
		return AdminInvalid("origin_id")
	}
	return nil
}
func (in *AdminReceiveLot) Validate() error {
	in.LotCode = strings.TrimSpace(in.LotCode)
	if in.LotCode == "" {
		return AdminInvalid("lot_code")
	}
	if in.Quantity <= 0 {
		return AdminInvalid("quantity")
	}
	date, err := time.Parse("2006-01-02", in.ProductionDate)
	if err != nil {
		return AdminInvalid("production_date")
	}
	if in.ExpirationDate != nil {
		expiry, err := time.Parse("2006-01-02", *in.ExpirationDate)
		if err != nil || expiry.Before(date) {
			return AdminInvalid("expiration_date")
		}
	}
	if in.Note != nil {
		note := strings.TrimSpace(*in.Note)
		in.Note = nil
		if note != "" {
			in.Note = &note
		}
	}
	return nil
}

// ValidateAdminWrite rejects unknown fields and nulls before any persistence call.
func ValidateAdminWrite(in AdminWrite) error {
	var fields, required, nullable []string
	switch in.Kind {
	case "create-product", "update-product":
		fields = []string{"title", "slug", "description", "status", "brand_id", "origin_id", "category_ids", "attributes", "images"}
		nullable = []string{"description", "brand_id", "origin_id"}
		if in.Kind == "create-product" {
			fields = append(fields, "product_type_id")
			fields = slices.DeleteFunc(fields, func(s string) bool { return s == "images" })
			required = []string{"product_type_id", "title", "slug", "attributes"}
		}
	case "create-variant", "update-variant":
		fields = []string{"sku", "barcode", "options", "attributes", "price_amount", "compare_at_price_amount", "weight_grams", "length_mm", "width_mm", "height_mm", "tax_category", "status", "position"}
		nullable = []string{"barcode", "compare_at_price_amount", "length_mm", "width_mm", "height_mm"}
		if in.Kind == "create-variant" {
			required = []string{"sku", "options", "attributes", "price_amount", "weight_grams", "tax_category"}
		}
	case "receipt":
		fields = []string{"lot_code", "production_date", "expiration_date", "quantity", "note"}
		required = []string{"lot_code", "production_date", "quantity"}
		nullable = []string{"expiration_date", "note"}
	default:
		return AdminInvalid("operation")
	}
	if in.Fields == nil {
		return AdminInvalid("body")
	}
	for _, k := range required {
		if _, ok := in.Fields[k]; !ok {
			return AdminInvalid(k)
		}
	}
	for k, v := range in.Fields {
		if !slices.Contains(fields, k) || string(v) == "null" && !slices.Contains(nullable, k) {
			return AdminInvalid(k)
		}
	}
	if raw, ok := in.Fields["images"]; ok {
		var images []map[string]json.RawMessage
		if err := json.Unmarshal(raw, &images); err != nil {
			return AdminInvalid("images")
		}
		for _, image := range images {
			for _, key := range []string{"id", "alt_text", "variant_id", "position"} {
				if _, ok := image[key]; !ok {
					return AdminInvalid("images." + key)
				}
			}
			if len(image) != 4 || string(image["id"]) == "null" || string(image["alt_text"]) == "null" || string(image["position"]) == "null" {
				return AdminInvalid("images")
			}
		}
	}
	if in.Kind != "create-product" && in.Version < 1 {
		return &Error{Status: 428, Code: "precondition_required"}
	}
	if in.Kind == "receipt" {
		if !ValidAdminID(in.ActorID) {
			return AdminInvalid("actor_id")
		}
		data, err := json.Marshal(in.Fields)
		if err != nil {
			return AdminInvalid("body")
		}
		var receipt AdminReceiveLot
		if err := json.Unmarshal(data, &receipt); err != nil {
			return AdminInvalid("body")
		}
		return receipt.Validate()
	}
	return nil
}
