package contracttest_test

import (
	"encoding/json"
	"testing"

	"github.com/freedomCruz/monte-luna/backend/internal/contracttest"
	"github.com/getkin/kin-openapi/openapi3"
)

// TestOrderQuoteSatisfiability verifies that OrderQuote satisfies QuoteShippingSummary
// with regular_shipping_amount present, in both free-shipping and paid-shipping scenarios,
// and rejects quotes missing regular_shipping_amount.
func TestOrderQuoteSatisfiability(t *testing.T) {
	contract := contracttest.Load(t, "orders.yaml")
	quoteSchemaRef := contract.Doc().Components.Schemas["OrderQuote"]
	if quoteSchemaRef == nil {
		t.Fatal("OrderQuote schema not found in orders.yaml")
	}

	validFreeQuote := `{
		"lines": [
			{
				"variant_id": "01946894-3d9a-7c98-b807-6c84c1762c2f",
				"product_slug": "finca-el-mirador",
				"product_title": "Finca El Mirador",
				"variant_label": "250 g / Grano entero",
				"sku": "MTL-MIR-250-GR",
				"unit_price_amount": 3800000,
				"quantity": 3,
				"line_total_amount": 11400000
			}
		],
		"shipping": {
			"rate_name": "Bogotá estándar",
			"shipping_amount": 0,
			"is_free_shipping": true,
			"estimated_days_min": 3,
			"estimated_days_max": 5,
			"regular_shipping_amount": 950000
		},
		"subtotal_amount": 11400000,
		"shipping_amount": 0,
		"tax_amount": 0,
		"total_amount": 11400000
	}`

	var freeData any
	if err := json.Unmarshal([]byte(validFreeQuote), &freeData); err != nil {
		t.Fatalf("unmarshal validFreeQuote: %v", err)
	}
	if err := quoteSchemaRef.Value.VisitJSON(freeData, openapi3.MultiErrors()); err != nil {
		t.Fatalf("expected valid free shipping quote to conform to OrderQuote schema: %v", err)
	}

	validPaidQuote := `{
		"lines": [
			{
				"variant_id": "01946894-3d9a-7c98-b807-6c84c1762c2f",
				"product_slug": "finca-el-mirador",
				"product_title": "Finca El Mirador",
				"variant_label": "250 g / Grano entero",
				"sku": "MTL-MIR-250-GR",
				"unit_price_amount": 3800000,
				"quantity": 1,
				"line_total_amount": 3800000
			}
		],
		"shipping": {
			"rate_name": "Bogotá estándar",
			"shipping_amount": 950000,
			"is_free_shipping": false,
			"estimated_days_min": 3,
			"estimated_days_max": 5,
			"regular_shipping_amount": 950000
		},
		"subtotal_amount": 3800000,
		"shipping_amount": 950000,
		"tax_amount": 0,
		"total_amount": 4750000
	}`

	var paidData any
	if err := json.Unmarshal([]byte(validPaidQuote), &paidData); err != nil {
		t.Fatalf("unmarshal validPaidQuote: %v", err)
	}
	if err := quoteSchemaRef.Value.VisitJSON(paidData, openapi3.MultiErrors()); err != nil {
		t.Fatalf("expected valid paid quote to conform to OrderQuote schema: %v", err)
	}

	missingRegularQuote := `{
		"lines": [
			{
				"variant_id": "01946894-3d9a-7c98-b807-6c84c1762c2f",
				"product_slug": "finca-el-mirador",
				"product_title": "Finca El Mirador",
				"variant_label": "250 g / Grano entero",
				"sku": "MTL-MIR-250-GR",
				"unit_price_amount": 3800000,
				"quantity": 1,
				"line_total_amount": 3800000
			}
		],
		"shipping": {
			"rate_name": "Bogotá estándar",
			"shipping_amount": 950000,
			"is_free_shipping": false,
			"estimated_days_min": 3,
			"estimated_days_max": 5
		},
		"subtotal_amount": 3800000,
		"shipping_amount": 950000,
		"tax_amount": 0,
		"total_amount": 4750000
	}`

	var missingData any
	if err := json.Unmarshal([]byte(missingRegularQuote), &missingData); err != nil {
		t.Fatalf("unmarshal missingRegularQuote: %v", err)
	}
	if err := quoteSchemaRef.Value.VisitJSON(missingData, openapi3.MultiErrors()); err == nil {
		t.Fatal("expected quote missing regular_shipping_amount to fail validation, but it passed")
	}
}
