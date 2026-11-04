package orders_test

import (
	"encoding/json"
	"testing"
	"time"
)

func TestAdminMetricsPaidBucketsAndRoleSafety(t *testing.T) {
	clock := &testClock{now: time.Date(2026, 11, 3, 6, 30, 0, 0, time.UTC)}
	db, m, mux, c := orderStorefront(t, clock, nil)
	variant := scalar[string](t, db, `SELECT id FROM catalog.product_variants WHERE sku='MIRADOR-250-WHOLE_BEAN'`)
	placed := decode(t, callPlacement(t, mux, c, placeBody(variant, 2), key, false))
	id := placed["order_id"].(string)
	execSQL(t, db, `UPDATE orders.orders SET status='paid',paid_at='2026-11-03T06:00:00Z' WHERE id=$1`, id)
	execSQL(t, db, `INSERT INTO orders.orders(order_number,status,subtotal_amount,shipping_amount,tax_amount,total_amount,shipping_rate_name,shipping_estimated_days_min,shipping_estimated_days_max,customer_email,customer_name,fiscal_profile_snapshot,tracking_token_hash,reservation_expires_at,placed_at,paid_at)
 SELECT 'ORD-'||n,'paid',100,0,0,100,'Standard',3,5,'other@example.com','Buyer','{}','hash-'||n,now(),'2026-11-02T06:00:00Z',CASE WHEN n=1 THEN '2026-11-02T06:00:00Z'::timestamptz ELSE '2026-11-03T06:30:00Z'::timestamptz END FROM generate_series(1,2) n`)
	execSQL(t, db, `INSERT INTO orders.order_lines(order_id,product_id,variant_id,sku,product_slug,product_title,variant_label,unit_price_amount,quantity,tax_category,tax_rate_bps,tax_amount,line_total_amount,weight_grams)
 SELECT o.id,l.product_id,l.variant_id,l.sku,l.product_slug,l.product_title,l.variant_label,100,3,l.tax_category,l.tax_rate_bps,0,300,l.weight_grams FROM orders.orders o CROSS JOIN orders.order_lines l WHERE o.order_number='ORD-1' AND l.order_id=$1`, id)
	p := &adminPayments{}
	if err := m.EnableAdminReads(p, adminImages{}, adminShipments{}); err != nil {
		t.Fatal(err)
	}
	before := placementSnapshot(t, db)
	got, err := m.AdminMetrics(t.Context(), map[string][]string{"period": {"today"}}, "staff")
	amount := scalar[int64](t, db, `SELECT total_amount FROM orders.orders WHERE id=$1`, id)
	if err != nil || got.KPIs.PaidSales.Value != amount || got.KPIs.PaidSales.Previous != 100 || got.KPIs.Orders.Value != 1 || got.KPIs.Units.Value != 2 || got.KPIs.Units.Previous != 3 || len(got.Series) != 2 || got.Series[0].SalesAmount != 0 || got.Series[1].SalesAmount != amount || got.Series[1].PreviousSalesAmount != 100 {
		t.Fatalf("metrics=%+v err=%v", got, err)
	}
	if got.Attention.ManualRefundCount != nil || p.refundCalls != 0 || got.Attention.PendingDispatchCount != 3 || len(got.LatestOrders) != 3 {
		t.Fatalf("attention=%+v calls=%d latest=%d", got.Attention, p.refundCalls, len(got.LatestOrders))
	}
	for _, status := range []string{"paid", "preparing", "shipped", "delivered", "cancelled", "pending_payment", "expired"} {
		execSQL(t, db, `UPDATE orders.orders SET status=$2 WHERE id=$1`, id, status)
		metrics, err := m.AdminMetrics(t.Context(), map[string][]string{"period": {"today"}}, "staff")
		want := int64(1)
		if status == "cancelled" || status == "pending_payment" || status == "expired" {
			want = 0
		}
		if err != nil || metrics.KPIs.Orders.Value != want {
			t.Fatalf("status=%s orders=%d err=%v", status, metrics.KPIs.Orders.Value, err)
		}
	}
	execSQL(t, db, `UPDATE orders.orders SET status='paid' WHERE id=$1`, id)
	owner, err := m.AdminMetrics(t.Context(), map[string][]string{"period": {"today"}}, "owner")
	if err != nil || owner.Attention.ManualRefundCount == nil || *owner.Attention.ManualRefundCount != 2 || p.refundCalls != 1 {
		t.Fatalf("owner=%+v err=%v", owner.Attention, err)
	}
	encoded, _ := json.Marshal(owner)
	var body any
	if err := json.Unmarshal(encoded, &body); err != nil {
		t.Fatal(err)
	}
	if err := c.Doc().Components.Schemas["AdminOrderMetrics"].Value.VisitJSON(body); err != nil {
		t.Fatal(err)
	}
	if _, err := m.AdminMetrics(t.Context(), map[string][]string{"period": {"range"}, "from_date": {"2026-11-03"}, "to_date": {"2026-11-02"}}, "owner"); err == nil {
		t.Fatal("invalid range accepted")
	}
	if placementSnapshot(t, db) != before || p.refundCalls != 1 {
		t.Fatal("metrics mutated data or queried refund count for rejected input")
	}
}
