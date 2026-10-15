package postgres_test

import (
	"context"
	"database/sql"
	"fmt"
	"testing"
	"time"

	"github.com/freedomCruz/monte-luna/backend/internal/orders/adapters/postgres"
	orderssql "github.com/freedomCruz/monte-luna/backend/internal/orders/adapters/postgres/sqlc"
	"github.com/jackc/pgx/v5/pgxpool"
	_ "github.com/jackc/pgx/v5/stdlib"
	"github.com/testcontainers/testcontainers-go"
	pgcontainer "github.com/testcontainers/testcontainers-go/modules/postgres"
)

func database(t *testing.T) (*sql.DB, string) {
	t.Helper()
	ctx, cancel := context.WithTimeout(t.Context(), 2*time.Minute)
	defer cancel()
	c, err := pgcontainer.Run(ctx, "postgres:18.6-bookworm@sha256:afc7e2d441324c0388fa80c3d24f733b4194a4eb7f47dd8ee2b08eb1a24a647c", pgcontainer.WithDatabase("orders_test"), pgcontainer.WithUsername("orders_test"), pgcontainer.WithPassword("orders_test"), pgcontainer.BasicWaitStrategies())
	if err != nil {
		t.Fatal(err)
	}
	testcontainers.CleanupContainer(t, c)
	url, err := c.ConnectionString(ctx, "sslmode=disable")
	if err != nil {
		t.Fatal(err)
	}
	db, err := sql.Open("pgx", url)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if err := db.Close(); err != nil {
			t.Error(err)
		}
	})
	return db, url
}
func execSQL(t *testing.T, db *sql.DB, query string, args ...any) {
	t.Helper()
	if _, err := db.ExecContext(t.Context(), query, args...); err != nil {
		t.Fatal(err)
	}
}
func scalar[T any](t *testing.T, db *sql.DB, query string, args ...any) T {
	t.Helper()
	var value T
	if err := db.QueryRowContext(t.Context(), query, args...).Scan(&value); err != nil {
		t.Fatal(err)
	}
	return value
}
func snapshot(t *testing.T, db *sql.DB) string {
	t.Helper()
	var result string
	for _, table := range []string{"orders", "order_lines", "order_line_lot_allocations", "order_shipping_addresses", "order_status_history", "outbox", "idempotency_keys"} {
		orderCol := "id"
		if table == "idempotency_keys" {
			orderCol = "key"
		}
		result += scalar[string](t, db, fmt.Sprintf(`SELECT COALESCE(jsonb_agg(to_jsonb(r) ORDER BY %s),'[]'::jsonb)::text FROM orders.%s r`, orderCol, table))
	}
	return result
}
func TestMigrationRoundTrip(t *testing.T) {
	db, url := database(t)
	for range 2 {
		if err := postgres.Migrate(t.Context(), db); err != nil {
			t.Fatal(err)
		}
		if err := postgres.Migrate(t.Context(), db); err != nil {
			t.Fatal(err)
		}
		if err := postgres.Seed(t.Context(), db); err != nil {
			t.Fatal(err)
		}
		if snapshot(t, db) != "[][][][][][][]" {
			t.Fatal("migrate/seed wrote orders")
		}
		if scalar[bool](t, db, `SELECT to_regclass('public.goose_db_version') IS NOT NULL`) {
			t.Fatal("version table leaked")
		}
		if scalar[int](t, db, `SELECT count(*) FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace WHERE n.nspname='orders' AND c.contype='f' AND c.confrelid NOT IN (SELECT oid FROM pg_class WHERE relnamespace=n.oid)`) != 0 {
			t.Fatal("cross-schema foreign key")
		}
		if !scalar[bool](t, db, `SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='orders' AND table_name='orders' AND column_name='shipping_is_free_shipping')`) {
			t.Fatal("migration 00002 did not add shipping_is_free_shipping")
		}
		if !scalar[bool](t, db, `SELECT to_regclass('orders.idempotency_keys') IS NOT NULL`) {
			t.Fatal("migration 00002 did not add idempotency_keys")
		}
		if err := postgres.Down(t.Context(), db); err != nil {
			t.Fatal(err)
		}
		if scalar[int](t, db, `SELECT count(*) FROM information_schema.tables WHERE table_schema='orders' AND table_name<>'goose_db_version'`) != 0 {
			t.Fatal("Down left module tables")
		}
		if scalar[bool](t, db, `SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='orders' AND table_name='orders' AND column_name='shipping_is_free_shipping')`) {
			t.Fatal("Down did not remove shipping_is_free_shipping")
		}
		if scalar[bool](t, db, `SELECT to_regclass('orders.idempotency_keys') IS NOT NULL`) {
			t.Fatal("Down did not drop idempotency_keys")
		}
	}
	if err := postgres.Migrate(t.Context(), db); err != nil {
		t.Fatal(err)
	}
	pool, err := pgxpool.New(t.Context(), url)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()
	if rows, err := orderssql.New(pool).ReadPendingOutbox(t.Context(), orderssql.ReadPendingOutboxParams{}); err != nil || len(rows) != 0 {
		t.Fatalf("pending outbox=%v/%v", rows, err)
	}
}

const orderFixture = `INSERT INTO orders.orders(order_number,status,subtotal_amount,shipping_amount,tax_amount,total_amount,shipping_rate_name,shipping_estimated_days_min,shipping_estimated_days_max,customer_email,customer_name,fiscal_profile_snapshot,tracking_token_hash,reservation_expires_at) VALUES ('ORD-7K2M9Q4X','pending_payment',100,20,0,120,'Standard',3,5,'buyer@example.com','Demo Buyer','{}','test-hash',now()+interval '30 minutes') RETURNING id`

func TestOrderSchemaConstraintsAndQueries(t *testing.T) {
	db, url := database(t)
	if err := postgres.Migrate(t.Context(), db); err != nil {
		t.Fatal(err)
	}
	id := scalar[string](t, db, orderFixture)
	if scalar[string](t, db, `SELECT uuid_extract_version(id)::text FROM orders.orders WHERE id=$1`, id) != "7" {
		t.Fatal("not UUIDv7")
	}
	for _, query := range []string{
		`UPDATE orders.orders SET total_amount=121`, `UPDATE orders.orders SET shipping_discount_amount=21,total_amount=99`,
		`UPDATE orders.orders SET subtotal_amount=-1,total_amount=19`, `UPDATE orders.orders SET tax_amount=-1,total_amount=119`,
		`UPDATE orders.orders SET discount_amount=-1,total_amount=121`, `UPDATE orders.orders SET shipping_estimated_days_min=0`,
		`UPDATE orders.orders SET shipping_estimated_days_max=2`, `UPDATE orders.orders SET shipping_estimated_days_min=NULL`,
		`UPDATE orders.orders SET customer_email='UPPER@example.com'`, `UPDATE orders.orders SET currency='cop'`,
		`UPDATE orders.orders SET status='invalid'`, `UPDATE orders.orders SET buyer_person_type='other'`,
	} {
		before := snapshot(t, db)
		if _, err := db.ExecContext(t.Context(), query); err == nil {
			t.Fatalf("accepted %s", query)
		}
		if snapshot(t, db) != before {
			t.Fatal("rejection changed data")
		}
	}
	line := scalar[string](t, db, `INSERT INTO orders.order_lines(order_id,product_id,variant_id,sku,product_slug,product_title,variant_label,unit_price_amount,quantity,tax_category,tax_rate_bps,tax_amount,line_total_amount,weight_grams) VALUES($1,uuidv7(),uuidv7(),'DEMO','demo','Demo','250 g',100,1,'excluded',0,0,100,250) RETURNING id`, id)
	execSQL(t, db, `INSERT INTO orders.order_line_lot_allocations(order_line_id,lot_id,lot_code,production_date,quantity) VALUES($1,uuidv7(),'DEMO',current_date,1)`, line)
	execSQL(t, db, `INSERT INTO orders.order_shipping_addresses(order_id,recipient_name,phone,address_line1,department_name,municipality_code,municipality_name) VALUES($1,'Demo','3001234567','Demo address','Bogotá','11001','Bogotá')`, id)
	execSQL(t, db, `INSERT INTO orders.order_status_history(order_id,to_status,actor_type) VALUES($1,'pending_payment','system')`, id)
	for _, query := range []string{`UPDATE orders.order_lines SET quantity=0`, `UPDATE orders.order_lines SET product_slug=NULL`, `UPDATE orders.order_lines SET unit_price_amount=0`, `UPDATE orders.order_lines SET tax_category='other'`, `UPDATE orders.order_lines SET weight_grams=0`, `UPDATE orders.order_line_lot_allocations SET quantity=0`, `UPDATE orders.order_shipping_addresses SET municipality_code='1100'`, `UPDATE orders.order_status_history SET actor_type='other'`} {
		before := snapshot(t, db)
		if _, err := db.ExecContext(t.Context(), query); err == nil {
			t.Fatalf("accepted %s", query)
		}
		if snapshot(t, db) != before {
			t.Fatal("rejection changed snapshots")
		}
	}
	pool, err := pgxpool.New(t.Context(), url)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()
	q := orderssql.New(pool)
	order, err := q.GetOrderByTrackingHash(t.Context(), "test-hash")
	if err != nil || order.ID != id || order.ShippingEstimatedDaysMin != 3 {
		t.Fatalf("order=%+v/%v", order, err)
	}
	if lines, err := q.ListOrderLines(t.Context(), id); err != nil || len(lines) != 1 || lines[0].ProductSlug != "demo" {
		t.Fatalf("lines=%+v/%v", lines, err)
	}
	if allocations, err := q.ListLineAllocations(t.Context(), line); err != nil || len(allocations) != 1 {
		t.Fatalf("allocations=%+v/%v", allocations, err)
	}
	if address, err := q.GetShippingAddress(t.Context(), id); err != nil || address.MunicipalityCode != "11001" {
		t.Fatalf("address=%+v/%v", address, err)
	}
	if history, err := q.ListOrderHistory(t.Context(), id); err != nil || len(history) != 1 {
		t.Fatalf("history=%+v/%v", history, err)
	}
	execSQL(t, db, `DELETE FROM orders.orders WHERE id=$1`, id)
	if snapshot(t, db) != "[][][][][][][]" {
		t.Fatal("same-schema cascade left snapshots")
	}
}
