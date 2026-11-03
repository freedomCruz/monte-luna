package orders_test

import (
	"context"
	"encoding/json"
	"testing"
	"time"

	"github.com/freedomCruz/monte-luna/backend/internal/orders"
)

type adminPayments struct {
	nequiID     string
	refundCalls int
}

func (p *adminPayments) AdminPayments(_ context.Context, ids []string) (map[string]orders.AdminPaymentSummary, error) {
	out := map[string]orders.AdminPaymentSummary{}
	for _, id := range ids {
		method := "card"
		if id == p.nequiID {
			method = "nequi"
		}
		out[id] = orders.AdminPaymentSummary{Status: "approved", Method: &method}
	}
	return out, nil
}
func (*adminPayments) PaymentAttempts(context.Context, string) ([]orders.AdminPaymentAttempt, error) {
	return []orders.AdminPaymentAttempt{}, nil
}
func (p *adminPayments) PendingManualRefunds(context.Context) (int64, error) {
	p.refundCalls++
	return 2, nil
}

type adminImages struct{}

func (adminImages) OrderImages(_ context.Context, ids []string) (map[string]string, error) {
	out := map[string]string{}
	for _, id := range ids {
		out[id] = "https://media.example/test.jpg"
	}
	return out, nil
}

type adminShipments struct{}

func (adminShipments) Shipment(context.Context, string) (*orders.AdminShipment, error) {
	return nil, nil
}

func TestAdminListAndDetailPublicReads(t *testing.T) {
	clock := &testClock{now: time.Date(2026, 11, 3, 15, 0, 0, 0, time.UTC)}
	db, m, mux, c := orderStorefront(t, clock, nil)
	variant := scalar[string](t, db, `SELECT id FROM catalog.product_variants WHERE sku='MIRADOR-250-WHOLE_BEAN'`)
	placed := decode(t, callPlacement(t, mux, c, placeBody(variant, 2), key, false))
	id := placed["order_id"].(string)
	p := &adminPayments{nequiID: id}
	if err := m.EnableAdminReads(p, adminImages{}, adminShipments{}); err != nil {
		t.Fatal(err)
	}
	execSQL(t, db, `INSERT INTO orders.orders(order_number,status,subtotal_amount,shipping_amount,tax_amount,total_amount,shipping_rate_name,shipping_estimated_days_min,shipping_estimated_days_max,customer_email,customer_name,fiscal_profile_snapshot,tracking_token_hash,reservation_expires_at,placed_at,paid_at) SELECT 'ORD-'||lpad(n::text,8,'0'),'paid',100,0,0,100,'Standard',3,5,'other@example.com','Other Buyer','{}','hash-'||n,now(),'2026-11-03T15:00:00Z','2026-11-03T15:00:00Z' FROM generate_series(1,26) n`)
	before := placementSnapshot(t, db)
	page, err := m.ListAdminOrders(t.Context(), map[string][]string{"date_filter": {"all"}})
	if err != nil || len(page.Items) != 25 || page.Total != 27 || page.NextCursor == nil || page.PendingDispatchCount != 26 {
		t.Fatalf("page=%+v err=%v", page, err)
	}
	next, err := m.ListAdminOrders(t.Context(), map[string][]string{"date_filter": {"all"}, "cursor": {*page.NextCursor}})
	if err != nil || len(next.Items) != 2 || next.NextCursor != nil || next.Total != 27 {
		t.Fatalf("next=%+v err=%v", next, err)
	}
	seen := map[string]bool{}
	for _, row := range append(page.Items, next.Items...) {
		if seen[row.ID] {
			t.Fatal("duplicate cursor row")
		}
		seen[row.ID] = true
	}
	for _, tt := range []struct {
		query map[string][]string
		total int64
	}{
		{map[string][]string{"date_filter": {"all"}, "search": {"BUYER@EXAMPLE.COM"}}, 1},
		{map[string][]string{"date_filter": {"all"}, "payment_method_type": {"nequi"}}, 1},
		{map[string][]string{"date_filter": {"all"}, "payment_method_type": {"nequi"}, "pending_dispatch": {"true"}}, 0},
		{map[string][]string{"date_filter": {"all"}, "status": {"paid"}, "sort": {"placed_at"}, "limit": {"50"}}, 26},
	} {
		got, err := m.ListAdminOrders(t.Context(), tt.query)
		if err != nil || got.Total != tt.total || got.PendingDispatchCount != 26 {
			t.Fatalf("filter=%v total=%d err=%v", tt.query, got.Total, err)
		}
	}
	if _, err := m.ListAdminOrders(t.Context(), map[string][]string{"date_filter": {"all"}, "cursor": {*page.NextCursor}, "search": {"changed"}}); err == nil {
		t.Fatal("cursor filter drift accepted")
	}
	if _, err := m.ListAdminOrders(t.Context(), map[string][]string{"limit": {"24"}}); err == nil {
		t.Fatal("invalid limit accepted")
	}
	detail, err := m.AdminOrder(t.Context(), id)
	if err != nil || detail.Version != 1 || len(detail.Lines) != 1 || len(detail.Lines[0].LotAllocations) == 0 || detail.Lines[0].ImageURL == nil || detail.Payment == nil || detail.Payment.Method == nil || *detail.Payment.Method != "nequi" {
		t.Fatalf("detail=%+v err=%v", detail, err)
	}
	bytes, err := json.Marshal(detail)
	if err != nil {
		t.Fatal(err)
	}
	var value any
	if err := json.Unmarshal(bytes, &value); err != nil {
		t.Fatal(err)
	}
	if err := c.Doc().Components.Schemas["AdminOrder"].Value.VisitJSON(value); err != nil {
		t.Fatalf("detail contract: %v", err)
	}
	if _, err := m.AdminOrder(t.Context(), "01946894-3d9a-7c98-b807-6c84c1762c35"); err == nil {
		t.Fatal("missing order accepted")
	}
	if placementSnapshot(t, db) != before || p.refundCalls != 0 {
		t.Fatal("read changed stored state or queried restricted refunds")
	}
}
