package postgres_test

import (
	"github.com/freedomCruz/monte-luna/backend/internal/orders/adapters/postgres"
	"github.com/jackc/pgx/v5/pgxpool"
	"testing"
)

func TestInventoryProjection(t *testing.T) {
	db, url := database(t)
	if err := postgres.Migrate(t.Context(), db); err != nil {
		t.Fatal(err)
	}
	pool, err := pgxpool.New(t.Context(), url)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()
	repo := postgres.NewRepository(pool)
	execSQL(t, db, `INSERT INTO orders.orders(order_number,status,subtotal_amount,shipping_amount,tax_amount,total_amount,shipping_rate_name,shipping_estimated_days_min,shipping_estimated_days_max,customer_email,customer_name,fiscal_profile_snapshot,tracking_token_hash,reservation_expires_at)
 SELECT 'ORD-'||n,status,100,0,0,100,'Standard',3,5,'test@example.com','Buyer','{}','hash-'||n,now()+interval '1 hour' FROM (VALUES (1,'pending_payment'),(2,'paid'),(3,'expired'),(4,'cancelled')) s(n,status);
 INSERT INTO orders.order_lines(order_id,product_id,variant_id,sku,product_slug,product_title,variant_label,unit_price_amount,quantity,tax_category,tax_rate_bps,tax_amount,line_total_amount,weight_grams)
 SELECT id,'01946894-3d9a-7c98-b807-6c84c1762c30','01946894-3d9a-7c98-b807-6c84c1762c31','SKU','product','Product','Variant',100,2,'excluded',0,0,200,250 FROM orders.orders;
 INSERT INTO orders.order_line_lot_allocations(order_line_id,lot_id,lot_code,production_date,quantity)
 SELECT id,'01946894-3d9a-7c98-b807-6c84c1762c32','LOT','2026-10-01',2 FROM orders.order_lines;`)
	before := snapshot(t, db)
	held, err := repo.HeldInventory(t.Context(), []string{"01946894-3d9a-7c98-b807-6c84c1762c31"})
	if err != nil || len(held) != 1 || held[0].Quantity != 2 {
		t.Fatalf("held %+v %v", held, err)
	}
	ids := []string{}
	rows, err := db.QueryContext(t.Context(), `SELECT id::text FROM orders.orders`)
	if err != nil {
		t.Fatal(err)
	}
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			t.Fatal(err)
		}
		ids = append(ids, id)
	}
	if err := rows.Err(); err != nil {
		t.Fatal(err)
	}
	if err := rows.Close(); err != nil {
		t.Fatal(err)
	}
	got, err := repo.InventoryOrders(t.Context(), ids)
	if err != nil || len(got) != 4 {
		t.Fatalf("orders %+v %v", got, err)
	}
	for _, o := range got {
		want := "released"
		if o.Status == "pending_payment" {
			want = "held"
		}
		if o.Status == "paid" {
			want = "committed"
		}
		if o.ReservationState != want {
			t.Fatalf("state %+v", o)
		}
	}
	if snapshot(t, db) != before {
		t.Fatal("inventory projection changed stored orders")
	}
	execSQL(t, db, `UPDATE orders.orders SET reservation_expires_at=now()-interval '1 minute' WHERE status='pending_payment'`)
	held, err = repo.HeldInventory(t.Context(), []string{"01946894-3d9a-7c98-b807-6c84c1762c31"})
	if err != nil || len(held) != 1 {
		t.Fatalf("unprocessed deadline %+v %v", held, err)
	}
	before = snapshot(t, db)
	empty, err := repo.InventoryOrders(t.Context(), []string{"01946894-3d9a-7c98-b807-6c84c1762c39"})
	if err != nil || len(empty) != 0 {
		t.Fatalf("missing %+v %v", empty, err)
	}
	if _, err := repo.HeldInventory(t.Context(), make([]string, 101)); err == nil {
		t.Fatal("unbounded batch")
	}
	if _, err := repo.InventoryOrders(t.Context(), make([]string, 101)); err == nil {
		t.Fatal("unbounded order batch")
	}
	if snapshot(t, db) != before {
		t.Fatal("rejected projection changed stored orders")
	}
}
