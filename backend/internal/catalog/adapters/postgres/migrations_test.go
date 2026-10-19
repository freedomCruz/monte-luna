package postgres_test

import (
	"context"
	"database/sql"
	"errors"
	"testing"
	"time"

	"github.com/freedomCruz/monte-luna/backend/internal/catalog/adapters/postgres"
	"github.com/jackc/pgx/v5/pgconn"
	_ "github.com/jackc/pgx/v5/stdlib"
	"github.com/testcontainers/testcontainers-go"
	pgcontainer "github.com/testcontainers/testcontainers-go/modules/postgres"
)

const postgresImage = "postgres:18.6-bookworm@sha256:afc7e2d441324c0388fa80c3d24f733b4194a4eb7f47dd8ee2b08eb1a24a647c"

func database(t *testing.T) (*sql.DB, string) {
	t.Helper()
	ctx, cancel := context.WithTimeout(t.Context(), 2*time.Minute)
	defer cancel()
	container, err := pgcontainer.Run(ctx, postgresImage,
		pgcontainer.WithDatabase("catalog_test"),
		pgcontainer.WithUsername("catalog_test"),
		pgcontainer.WithPassword("catalog_test"),
		pgcontainer.BasicWaitStrategies())
	if err != nil {
		t.Fatalf("start PostgreSQL 18: %v", err)
	}
	testcontainers.CleanupContainer(t, container)
	url, err := container.ConnectionString(ctx, "sslmode=disable")
	if err != nil {
		t.Fatalf("connection string: %v", err)
	}
	db, err := sql.Open("pgx", url)
	if err != nil {
		t.Fatalf("open database: %v", err)
	}
	t.Cleanup(func() {
		if err := db.Close(); err != nil {
			t.Errorf("close database: %v", err)
		}
	})
	return db, url
}

func execSQL(t *testing.T, db *sql.DB, query string, args ...any) {
	t.Helper()
	if _, err := db.ExecContext(t.Context(), query, args...); err != nil {
		t.Fatalf("execute fixture SQL: %v", err)
	}
}

func scalar[T any](t *testing.T, db *sql.DB, query string, args ...any) T {
	t.Helper()
	var value T
	if err := db.QueryRowContext(t.Context(), query, args...).Scan(&value); err != nil {
		t.Fatalf("query assertion: %v", err)
	}
	return value
}

func TestMigrationsRoundTrip(t *testing.T) {
	db, _ := database(t)
	for cycle := range 2 {
		if err := postgres.Migrate(t.Context(), db); err != nil {
			t.Fatalf("cycle %d migrate up: %v", cycle, err)
		}
		for _, table := range []string{
			"brands", "origins", "origin_images", "product_types", "attribute_definitions",
			"products", "product_variants", "product_images", "lots", "categories",
			"product_categories", "variant_lot_stock", "inventory_movements", "goose_db_version",
		} {
			if !scalar[bool](t, db, `SELECT to_regclass($1) IS NOT NULL`, "catalog."+table) {
				t.Errorf("missing catalog.%s", table)
			}
		}
		for _, table := range []string{"outbox", "processed_events"} {
			if !scalar[bool](t, db, `SELECT to_regclass($1) IS NOT NULL`, "catalog."+table) {
				t.Errorf("missing catalog.%s", table)
			}
		}
		if scalar[bool](t, db, `SELECT to_regclass('public.goose_db_version') IS NOT NULL`) {
			t.Error("migration version table leaked into public")
		}
		if err := postgres.Migrate(t.Context(), db); err != nil {
			t.Fatalf("repeat migrate: %v", err)
		}
		if err := postgres.Down(t.Context(), db); err != nil {
			t.Fatalf("cycle %d migrate down: %v", cycle, err)
		}
		if got := scalar[int](t, db, `SELECT count(*) FROM information_schema.tables WHERE table_schema='catalog' AND table_name <> 'goose_db_version'`); got != 0 {
			t.Fatalf("down left %d catalog tables", got)
		}
	}
}

func migrationFixture(t *testing.T) *sql.DB {
	t.Helper()
	db, _ := database(t)
	if err := postgres.Migrate(t.Context(), db); err != nil {
		t.Fatalf("migrate: %v", err)
	}
	execSQL(t, db, `INSERT INTO catalog.product_types (name, slug) VALUES ('Coffee', 'coffee');
		INSERT INTO catalog.products (product_type_id, title, slug, status)
		SELECT id, 'Product ' || n, 'product-' || n, 'published'
		FROM catalog.product_types CROSS JOIN generate_series(1,2) AS n;
		INSERT INTO catalog.product_variants (product_id, sku, options, price_amount, weight_grams, tax_category, status, position)
		SELECT id, slug || '-250', '{"presentation":"250_g"}', 3800000, 250, 'excluded', 'active', 0 FROM catalog.products;
		INSERT INTO catalog.lots (product_id, lot_code, production_date, status)
		SELECT id, 'test-lot', DATE '2026-10-01', 'active' FROM catalog.products;
		INSERT INTO catalog.variant_lot_stock (product_id, variant_id, lot_id, quantity)
		SELECT p.id, v.id, l.id, 5 FROM catalog.products p
		JOIN catalog.product_variants v ON v.product_id=p.id JOIN catalog.lots l ON l.product_id=p.id`)
	return db
}

func TestStockCannotCrossProductBoundary(t *testing.T) {
	db := migrationFixture(t)
	before := scalar[string](t, db, `SELECT jsonb_agg(to_jsonb(s) ORDER BY id)::text FROM catalog.variant_lot_stock s`)
	for _, tc := range []struct {
		name, query string
	}{
		{"foreign_lot", `UPDATE catalog.variant_lot_stock SET lot_id=(SELECT l.id FROM catalog.lots l JOIN catalog.products p ON p.id=l.product_id WHERE p.slug='product-2') WHERE product_id=(SELECT id FROM catalog.products WHERE slug='product-1')`},
		{"foreign_variant", `UPDATE catalog.variant_lot_stock SET variant_id=(SELECT v.id FROM catalog.product_variants v JOIN catalog.products p ON p.id=v.product_id WHERE p.slug='product-2') WHERE product_id=(SELECT id FROM catalog.products WHERE slug='product-1')`},
	} {
		t.Run(tc.name, func(t *testing.T) {
			_, err := db.ExecContext(t.Context(), tc.query)
			assertSQLState(t, err, "23503")
			if got := scalar[string](t, db, `SELECT jsonb_agg(to_jsonb(s) ORDER BY id)::text FROM catalog.variant_lot_stock s`); got != before {
				t.Error("rejected foreign product changed stored stock")
			}
		})
	}
}

func TestCompareAtMustExceedPrice(t *testing.T) {
	db := migrationFixture(t)
	for _, amount := range []int64{3799999, 3800000} {
		_, err := db.ExecContext(t.Context(), `UPDATE catalog.product_variants SET compare_at_price_amount=$1`, amount)
		assertSQLState(t, err, "23514")
		if got := scalar[int](t, db, `SELECT count(*) FROM catalog.product_variants WHERE compare_at_price_amount IS NOT NULL OR price_amount<>3800000`); got != 0 {
			t.Error("rejected price changed stored prices")
		}
	}
	execSQL(t, db, `UPDATE catalog.product_variants SET compare_at_price_amount=4500000`)
	if got := scalar[int](t, db, `SELECT count(*) FROM catalog.product_variants WHERE compare_at_price_amount=4500000`); got != 2 {
		t.Errorf("valid reference price persisted to %d variants, want 2", got)
	}
}

func TestStockQuantityCannotBeNegative(t *testing.T) {
	db := migrationFixture(t)
	_, err := db.ExecContext(t.Context(), `UPDATE catalog.variant_lot_stock SET quantity=-1`)
	assertSQLState(t, err, "23514")
	if got := scalar[int](t, db, `SELECT sum(quantity) FROM catalog.variant_lot_stock`); got != 10 {
		t.Errorf("rejected quantity changed stock to %d, want 10", got)
	}
	execSQL(t, db, `UPDATE catalog.variant_lot_stock SET quantity=0`)
	if got := scalar[int](t, db, `SELECT sum(quantity) FROM catalog.variant_lot_stock`); got != 0 {
		t.Errorf("zero stock rejected or changed: %d", got)
	}
}

func assertSQLState(t *testing.T, err error, code string) {
	t.Helper()
	var pgErr *pgconn.PgError
	if !errors.As(err, &pgErr) || pgErr.Code != code {
		t.Fatalf("error = %v, want PostgreSQL SQLSTATE %s", err, code)
	}
}
