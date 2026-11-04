package contracttest_test

import (
	"encoding/json"
	"fmt"
	"reflect"
	"strings"
	"testing"

	"github.com/freedomCruz/monte-luna/backend/internal/contracttest"
	"github.com/getkin/kin-openapi/openapi3"
)

func TestAdminOrdersOperations(t *testing.T) {
	tests := []struct{ file, method, path, id string }{
		{"orders.yaml", "GET", "/api/v1/admin/orders", "listAdminOrders"},
		{"orders.yaml", "GET", "/api/v1/admin/orders/{id}", "getAdminOrder"},
		{"orders.yaml", "GET", "/api/v1/admin/orders/metrics", "getAdminOrderMetrics"},
		{"orders.yaml", "POST", "/api/v1/admin/orders/{id}/to-preparing", "prepareAdminOrder"},
		{"orders.yaml", "POST", "/api/v1/admin/orders/{id}/deliver", "deliverAdminOrder"},
		{"orders.yaml", "POST", "/api/v1/admin/orders/{id}/cancel", "cancelAdminOrder"},
		{"shipping.yaml", "POST", "/api/v1/admin/orders/{id}/dispatch", "dispatchAdminOrder"},
	}
	for _, tt := range tests {
		t.Run(tt.id, func(t *testing.T) {
			doc := contracttest.Load(t, tt.file).Doc()
			path := doc.Paths.Find(tt.path)
			if path == nil {
				t.Fatalf("missing path %s", tt.path)
			}
			op := path.GetOperation(tt.method)
			if op == nil || op.OperationID != tt.id {
				t.Fatalf("missing operation %s", tt.id)
			}
			if op.Security == nil || len(*op.Security) != 1 {
				t.Fatal("each admin operation must explicitly require adminSession")
			}
			if _, ok := (*op.Security)[0]["adminSession"]; !ok {
				t.Fatal("adminSession required")
			}
			scheme := doc.Components.SecuritySchemes["adminSession"]
			if scheme == nil || scheme.Value == nil || scheme.Value.In != "cookie" || scheme.Value.Name != "__Host-session" {
				t.Fatal("session must resolve to the shared cookie scheme")
			}
			roles, _ := json.Marshal(op.Extensions["x-roles"])
			if string(roles) != `["owner","staff"]` {
				t.Fatalf("owner and staff required, got %s", roles)
			}
			for _, status := range []string{"200", "400", "401", "403", "422", "500"} {
				response := op.Responses.Value(status)
				if response == nil || response.Value == nil {
					t.Fatalf("missing resolved %s response", status)
				}
				cache := response.Value.Headers["Cache-Control"]
				if cache == nil || cache.Value == nil || cache.Value.Schema == nil || !strings.Contains(cache.Value.Schema.Value.Pattern, "no-store") {
					t.Fatalf("%s must declare no-store", status)
				}
				if status != "200" {
					problem := response.Value.Content.Get("application/problem+json")
					if problem == nil || problem.Schema == nil || problem.Schema.Value.Properties["code"] == nil {
						t.Fatalf("%s must resolve RFC 9457 Problem", status)
					}
				}
			}
			if tt.method == "POST" {
				var ifMatch *openapi3.Parameter
				for _, p := range op.Parameters {
					if p.Value.Name == "If-Match" {
						ifMatch = p.Value
					}
				}
				if ifMatch == nil || !ifMatch.Required || ifMatch.Schema.Value.Pattern != `^"[1-9][0-9]*"$` {
					t.Fatal("writes require a strong version If-Match")
				}
				for _, status := range []string{"404", "409", "412"} {
					r := op.Responses.Value(status)
					if r == nil || r.Value.Content.Get("application/problem+json") == nil {
						t.Fatalf("missing %s problem", status)
					}
				}
			}
		})
	}
}

func TestAdminOrderListParameters(t *testing.T) {
	doc := contracttest.Load(t, "orders.yaml").Doc()
	path := doc.Paths.Find("/api/v1/admin/orders")
	if path == nil {
		t.Fatal("admin order list missing")
	}
	params := map[string]*openapi3.Parameter{}
	for _, p := range path.Get.Parameters {
		params[p.Value.Name] = p.Value
	}
	for _, name := range []string{"search", "status", "from_date", "to_date", "date_filter", "payment_method_type", "pending_dispatch", "sort", "limit", "cursor"} {
		if params[name] == nil {
			t.Fatalf("missing query %s", name)
		}
	}
	if got := params["limit"].Schema.Value.Enum; !reflect.DeepEqual(got, []any{float64(25), float64(50), float64(100)}) {
		t.Fatalf("page sizes: %v", got)
	}
	if got := params["sort"].Schema.Value.Enum; !reflect.DeepEqual(got, []any{"placed_at", "-placed_at"}) {
		t.Fatalf("sort: %v", got)
	}
	page := doc.Components.Schemas["AdminOrderPage"].Value
	for _, key := range []string{"items", "next_cursor", "total", "pending_dispatch_count"} {
		if page.Properties[key] == nil {
			t.Fatalf("page missing %s", key)
		}
	}
}

func TestAdminOrderScreenFields(t *testing.T) {
	doc := contracttest.Load(t, "orders.yaml").Doc()
	for name, fields := range map[string][]string{
		"AdminOrder":          {"id", "order_number", "status", "payment", "placed_at", "paid_at", "customer", "shipping_address", "lines", "summary", "payment_attempts", "status_history", "shipment", "version"},
		"AdminOrderLine":      {"product_title", "variant_label", "sku", "image_url", "quantity", "unit_price_amount", "line_total_amount", "lot_allocations"},
		"AdminLotAllocation":  {"lot_id", "lot_code", "production_date", "quantity"},
		"AdminOrderSummary":   {"subtotal_amount", "discount_amount", "coupon_code", "shipping_amount", "shipping_discount_amount", "tax_amount", "total_amount", "shipping"},
		"AdminShippingRate":   {"rate_name", "zone_name", "min_weight_grams", "max_weight_grams", "estimated_days_min", "estimated_days_max"},
		"AdminPaymentAttempt": {"reference", "payment_method_type", "status", "provider_transaction_id", "created_at", "finalized_at"},
		"AdminOrderHistory":   {"from_status", "to_status", "actor_type", "actor_id", "note", "created_at"},
		"AdminOrderMetrics":   {"period", "time_zone", "from_at", "to_at", "previous_from_at", "previous_to_at", "granularity", "kpis", "series", "attention", "latest_orders"},
		"AdminOrderKPIs":      {"paid_sales_amount", "orders", "average_order_amount", "units_sold"},
		"AdminSalesBucket":    {"from_at", "to_at", "previous_from_at", "previous_to_at", "sales_amount", "previous_sales_amount"},
	} {
		t.Run(name, func(t *testing.T) {
			ref := doc.Components.Schemas[name]
			if ref == nil {
				t.Fatalf("missing schema %s", name)
			}
			for _, key := range fields {
				if ref.Value.Properties[key] == nil || !contains(ref.Value.Required, key) {
					t.Errorf("missing required field %s", key)
				}
			}
		})
	}
}

func TestAdminOrderRequestSchemas(t *testing.T) {
	tests := []struct {
		file, schema, body string
		invalid            bool
	}{
		{"orders.yaml", "AdminOrderAction", `{}`, false},
		{"orders.yaml", "AdminOrderAction", `{"status":"delivered"}`, true},
		{"orders.yaml", "CancelAdminOrder", `{}`, false},
		{"orders.yaml", "CancelAdminOrder", `{"reason":null}`, false},
		{"orders.yaml", "CancelAdminOrder", `{"reason":"Customer requested cancellation"}`, false},
		{"orders.yaml", "CancelAdminOrder", `{"refund_amount":1}`, true},
		{"shipping.yaml", "DispatchAdminOrder", `{"carrier_name":"Coordinadora","shipment_version":null}`, false},
		{"shipping.yaml", "DispatchAdminOrder", `{"carrier_name":"Coordinadora","shipment_version":3,"tracking_number":null,"tracking_url":null}`, false},
		{"shipping.yaml", "DispatchAdminOrder", `{"carrier_name":"Coordinadora","shipment_version":3,"tracking_number":"123","tracking_url":"https://carrier.example/123"}`, false},
		{"shipping.yaml", "DispatchAdminOrder", `{"shipment_version":null}`, true},
		{"shipping.yaml", "DispatchAdminOrder", `{"carrier_name":"  ","shipment_version":null}`, true},
		{"shipping.yaml", "DispatchAdminOrder", `{"carrier_name":"Carrier","shipment_version":0}`, true},
		{"shipping.yaml", "DispatchAdminOrder", `{"carrier_name":"Carrier","shipment_version":1,"tracking_url":"http://carrier.example/123"}`, true},
		{"shipping.yaml", "DispatchAdminOrder", `{"carrier_name":"Carrier","shipment_version":1,"tracking_url":"javascript:alert(1)"}`, true},
		{"shipping.yaml", "DispatchAdminOrder", `{"carrier_name":"Carrier","shipment_version":1,"extra":true}`, true},
	}
	for _, tt := range tests {
		t.Run(tt.schema+tt.body, func(t *testing.T) {
			doc := contracttest.Load(t, tt.file).Doc()
			ref := doc.Components.Schemas[tt.schema]
			if ref == nil {
				t.Fatalf("missing schema %s", tt.schema)
			}
			var value any
			if err := json.Unmarshal([]byte(tt.body), &value); err != nil {
				t.Fatal(err)
			}
			err := ref.Value.VisitJSON(value)
			if (err != nil) != tt.invalid {
				t.Fatalf("invalid=%v: %v", tt.invalid, err)
			}
		})
	}
}

func TestAdminRefundCountIsRoleDiscriminated(t *testing.T) {
	doc := contracttest.Load(t, "orders.yaml").Doc()
	ref := doc.Components.Schemas["AdminOrderAttention"]
	if ref == nil {
		t.Fatal("attention schema missing")
	}
	for _, tt := range []struct {
		body    string
		invalid bool
	}{
		{`{"role":"staff","pending_dispatch_count":0,"oldest_pending_dispatch_paid_at":null,"manual_refund_count":null}`, false},
		{`{"role":"owner","pending_dispatch_count":0,"oldest_pending_dispatch_paid_at":null,"manual_refund_count":2}`, false},
		{`{"role":"staff","pending_dispatch_count":0,"oldest_pending_dispatch_paid_at":null,"manual_refund_count":2}`, true},
		{`{"role":"owner","pending_dispatch_count":0,"oldest_pending_dispatch_paid_at":null,"manual_refund_count":null}`, true},
	} {
		var value any
		if err := json.Unmarshal([]byte(tt.body), &value); err != nil {
			t.Fatal(err)
		}
		if err := ref.Value.VisitJSON(value); (err != nil) != tt.invalid {
			t.Fatalf("invalid=%v: %v", tt.invalid, err)
		}
	}
}

func TestAdminOrderHistoricalDetail(t *testing.T) {
	doc := contracttest.Load(t, "orders.yaml").Doc()
	const fixture = `{
		"id":"01946894-3d9a-7c98-b807-6c84c1762c2f","order_number":"ORD-7K2M9Q4X",
		"status":"paid","payment":{"status":"approved","payment_method_type":"nequi"},
		"placed_at":"2026-11-03T15:00:00Z","paid_at":"2026-11-03T15:01:00Z","cancelled_at":null,
		"customer":{"full_name":"Test Buyer","email":"buyer@example.com","phone":null},
		"shipping_address":{"recipient_name":"Test Buyer","recipient_phone":"3001234567",
		"municipality_code":"11001","municipality_name":"Bogota","department_name":"Bogota",
		"address_line1":"Street 123","address_line2":null,"postal_code":null,"delivery_notes":null},
		"lines":[{"id":"01946894-3d9a-7c98-b807-6c84c1762c2f","variant_id":"01946894-3d9a-7c98-b807-6c84c1762c2f",
		"product_slug":"coffee","product_title":"Coffee","variant_label":"250 g","sku":"COFFEE-250",
		"image_url":null,"quantity":1,"unit_price_amount":100,"discount_amount":0,"tax_amount":0,
		"line_total_amount":100,"lot_allocations":[{"lot_id":"01946894-3d9a-7c98-b807-6c84c1762c2f",
		"lot_code":"LOT-1","production_date":"2026-11-01","quantity":1}]}],
		"summary":{"subtotal_amount":100,"discount_amount":0,"coupon_code":null,"shipping_amount":0,
		"shipping_discount_amount":0,"tax_amount":0,"total_amount":100,"shipping":{"rate_name":"Standard",
		"zone_name":null,"min_weight_grams":null,"max_weight_grams":null,"estimated_days_min":3,"estimated_days_max":5}},
		"payment_attempts":[],"status_history":[],"shipment":null,"version":1
	}`
	var value map[string]any
	if err := json.Unmarshal([]byte(fixture), &value); err != nil {
		t.Fatal(err)
	}
	schema := doc.Components.Schemas["AdminOrder"].Value
	if err := schema.VisitJSON(value); err != nil {
		t.Fatalf("historical detail: %v", err)
	}
	value["tracking_token"] = "must-not-leak"
	if err := schema.VisitJSON(value); err == nil {
		t.Fatal("admin detail must not expose guest capabilities")
	}
}

func TestAdminShipmentStateFields(t *testing.T) {
	doc := contracttest.Load(t, "orders.yaml").Doc()
	ref := doc.Components.Schemas["AdminShipment"]
	if ref == nil {
		t.Fatal("missing AdminShipment")
	}
	for _, tt := range []struct {
		status                      string
		carrier, shipped, delivered any
		invalid                     bool
	}{
		{"pending", nil, nil, nil, false},
		{"shipped", "Carrier", "2026-11-03T15:00:00Z", nil, false},
		{"shipped", nil, "2026-11-03T15:00:00Z", nil, true},
		{"shipped", "Carrier", nil, nil, true},
		{"delivered", "Carrier", "2026-11-03T15:00:00Z", "2026-11-04T15:00:00Z", false},
		{"delivered", "Carrier", "2026-11-03T15:00:00Z", nil, true},
	} {
		t.Run(tt.status+fmt.Sprint(tt.carrier, tt.delivered), func(t *testing.T) {
			value := map[string]any{"id": "01946894-3d9a-7c98-b807-6c84c1762c2f", "order_id": "01946894-3d9a-7c98-b807-6c84c1762c2f", "status": tt.status, "carrier_name": tt.carrier, "tracking_number": nil, "tracking_url": nil, "shipped_at": tt.shipped, "delivered_at": tt.delivered, "actor_id": nil, "version": float64(1)}
			if err := ref.Value.VisitJSON(value); (err != nil) != tt.invalid {
				t.Fatalf("invalid=%v: %v", tt.invalid, err)
			}
		})
	}
}

func TestAdminOrderFilterValues(t *testing.T) {
	doc := contracttest.Load(t, "orders.yaml").Doc()
	for _, tt := range []struct {
		path, parameter string
		value           any
		invalid         bool
	}{
		{"/api/v1/admin/orders", "limit", float64(25), false},
		{"/api/v1/admin/orders", "limit", float64(50), false},
		{"/api/v1/admin/orders", "limit", float64(100), false},
		{"/api/v1/admin/orders", "limit", float64(24), true},
		{"/api/v1/admin/orders", "limit", float64(101), true},
		{"/api/v1/admin/orders", "sort", "placed_at", false},
		{"/api/v1/admin/orders", "sort", "-placed_at", false},
		{"/api/v1/admin/orders", "sort", "total_amount", true},
		{"/api/v1/admin/orders", "status", []any{"paid", "preparing"}, false},
		{"/api/v1/admin/orders", "status", []any{"refunded"}, true},
		{"/api/v1/admin/orders", "payment_method_type", []any{"nequi", "card"}, false},
		{"/api/v1/admin/orders", "payment_method_type", []any{"cash"}, true},
		{"/api/v1/admin/orders", "date_filter", "all", false},
		{"/api/v1/admin/orders", "date_filter", "range", false},
		{"/api/v1/admin/orders/metrics", "period", "today", false},
		{"/api/v1/admin/orders/metrics", "period", "last_7_days", false},
		{"/api/v1/admin/orders/metrics", "period", "last_30_days", false},
		{"/api/v1/admin/orders/metrics", "period", "range", false},
		{"/api/v1/admin/orders/metrics", "period", "year", true},
	} {
		t.Run(tt.parameter+":"+tt.path+":"+fmt.Sprint(tt.value), func(t *testing.T) {
			path := doc.Paths.Find(tt.path)
			if path == nil {
				t.Fatal("missing operation")
			}
			for _, p := range path.Get.Parameters {
				if p.Value.Name == tt.parameter {
					err := p.Value.Schema.Value.VisitJSON(tt.value)
					if (err != nil) != tt.invalid {
						t.Fatalf("invalid=%v: %v", tt.invalid, err)
					}
					return
				}
			}
			t.Fatal("missing parameter")
		})
	}
}

func contains(values []string, value string) bool {
	for _, v := range values {
		if v == value {
			return true
		}
	}
	return false
}
