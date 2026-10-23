package postgres_test

import (
	"database/sql"
	"fmt"
	"testing"

	"github.com/freedomCruz/monte-luna/backend/internal/catalog/adapters/postgres"
)

func catalogSnapshot(t *testing.T, db *sql.DB) map[string]string {
	t.Helper()
	result := make(map[string]string)
	for _, table := range []string{
		"brands", "origins", "origin_images", "product_types", "attribute_definitions",
		"products", "product_variants", "product_images", "lots", "categories",
		"product_categories", "variant_lot_stock", "inventory_movements",
	} {
		// Table names come exclusively from this fixed list, never external input.
		result[table] = scalar[string](t, db, fmt.Sprintf(
			`SELECT COALESCE(jsonb_agg(to_jsonb(r) ORDER BY id), '[]'::jsonb)::text FROM catalog.%s r`, table))
	}
	return result
}

func assertSameCatalog(t *testing.T, db *sql.DB, before map[string]string) {
	t.Helper()
	for table, after := range catalogSnapshot(t, db) {
		if after != before[table] {
			t.Errorf("catalog.%s changed unexpectedly", table)
		}
	}
}

func TestDemoSeedIsIdempotent(t *testing.T) {
	db, _ := database(t)
	if err := postgres.Migrate(t.Context(), db); err != nil {
		t.Fatal(err)
	}
	if err := postgres.Seed(t.Context(), db); err != nil {
		t.Fatalf("first seed: %v", err)
	}
	assertDemo(t, db)
	before := catalogSnapshot(t, db)
	if err := postgres.Seed(t.Context(), db); err != nil {
		t.Fatalf("second seed: %v", err)
	}
	assertSameCatalog(t, db, before)

	// Re-seeding must never replenish sold stock or erase its movement history.
	execSQL(t, db, `WITH changed AS (
		UPDATE catalog.variant_lot_stock SET quantity=quantity-1
		WHERE id=(SELECT id FROM catalog.variant_lot_stock WHERE quantity>0 ORDER BY id LIMIT 1)
		RETURNING variant_id,lot_id
	) INSERT INTO catalog.inventory_movements (variant_id,lot_id,quantity_delta,reason)
	SELECT variant_id,lot_id,-1,'sale' FROM changed`)
	before = catalogSnapshot(t, db)
	if err := postgres.Seed(t.Context(), db); err != nil {
		t.Fatalf("seed after sale: %v", err)
	}
	assertSameCatalog(t, db, before)
}

func assertDemo(t *testing.T, db *sql.DB) {
	t.Helper()
	for _, tc := range []struct {
		query string
		want  int
	}{
		{`SELECT count(*) FROM catalog.product_types WHERE slug IN ('coffee','cacao')`, 2},
		{`SELECT count(*) FROM catalog.products WHERE status='published'`, 4},
		{`SELECT count(*) FROM catalog.products WHERE origin_id IS NULL`, 1},
		{`SELECT count(*) FROM catalog.origins WHERE slug IS NOT NULL AND municipality_code ~ '^[0-9]{5}$' AND department IS NOT NULL AND altitude_min_masl>0 AND altitude_max_masl>=altitude_min_masl AND story IS NOT NULL`, 2},
		{`SELECT count(*) FROM catalog.brands`, 1},
		{`SELECT count(*) FROM catalog.categories WHERE status='active'`, 3},
		{`SELECT count(*) FROM catalog.attribute_definitions`, 16},
		{`SELECT count(*) FROM catalog.attribute_definitions WHERE key='roast_level' AND scope='product' AND NOT is_variant_option`, 1},
		{`SELECT count(*) FROM catalog.attribute_definitions WHERE product_type_id=(SELECT id FROM catalog.product_types WHERE slug='coffee') AND key IN ('presentation','grind') AND is_variant_option AND scope='variant'`, 2},
		{`SELECT count(*) FROM catalog.product_variants WHERE status='active'`, 11},
		{`SELECT count(*) FROM catalog.product_variants WHERE sku LIKE 'MIRADOR-%'`, 8},
		{`SELECT count(*) FROM catalog.product_variants WHERE sku='MIRADOR-250-WHOLE_BEAN' AND price_amount=3800000 AND compare_at_price_amount=4500000`, 1},
		{`SELECT count(*) FROM catalog.product_variants WHERE weight_grams IN (250,500) AND sku LIKE 'MIRADOR-%'`, 8},
		{`SELECT count(*) FROM catalog.lots`, 5},
		{`SELECT count(*) FROM catalog.origin_images WHERE storage_key LIKE 'images/%' AND alt_text<>''`, 2},
		{`SELECT count(*) FROM catalog.product_images WHERE storage_key LIKE 'images/%' AND alt_text<>''`, 4},
		{`SELECT count(*) FROM catalog.product_images WHERE storage_key ~ '^(/|https?://)'`, 0},
		{`SELECT count(*) FROM catalog.origin_images WHERE storage_key ~ '^(/|https?://)'`, 0},
		{`SELECT count(*) FROM catalog.brands WHERE slug='monteluna' AND logo_storage_key IS NULL`, 1},
		{`SELECT count(*) FROM catalog.product_categories`, 6},
		{`SELECT count(*) FROM catalog.product_types WHERE slug='coffee' AND name='Café'`, 1},
		{`SELECT count(*) FROM catalog.categories WHERE slug='coffee' AND name='Café'`, 1},
		{`SELECT count(*) FROM catalog.brands WHERE slug='monteluna' AND description='Marca comercial demo'`, 1},
		{`SELECT count(*) FROM catalog.origins WHERE slug='finca-el-mirador' AND producer_name='Productor de café demo' AND story LIKE '[Historia demo]%'`, 1},
		{`SELECT count(*) FROM catalog.origins WHERE slug='demo-cacao-origin' AND name='[Origen de cacao demo]' AND producer_name='Productor de cacao demo' AND story LIKE '[Historia demo]%'`, 1},
		{`SELECT count(*) FROM catalog.attribute_definitions WHERE key='roast_level' AND label='Tostión'`, 1},
		{`SELECT count(*) FROM catalog.attribute_definitions WHERE key='presentation' AND label='Presentación'`, 2},
		{`SELECT count(*) FROM catalog.attribute_definitions WHERE key='grind' AND label='Molienda'`, 1},
		{`SELECT count(*) FROM catalog.attribute_definitions WHERE key='process' AND label='Proceso'`, 1},
		{`SELECT count(*) FROM catalog.attribute_definitions WHERE key='tasting_notes' AND label='Notas de cata'`, 1},
		{`SELECT count(*) FROM catalog.attribute_definitions WHERE key='species' AND label='Especie'`, 1},
		{`SELECT count(*) FROM catalog.attribute_definitions WHERE key='cupping_score' AND label='Puntaje de cata'`, 1},
		{`SELECT count(*) FROM catalog.attribute_definitions WHERE key='cupping_protocol' AND label='Protocolo de evaluación'`, 1},
		{`SELECT count(*) FROM catalog.attribute_definitions WHERE key='genetic_group' AND label='Grupo genético'`, 1},
		{`SELECT count(*) FROM catalog.attribute_definitions WHERE key='fermentation' AND label='Fermentación'`, 1},
		{`SELECT count(*) FROM catalog.attribute_definitions WHERE key='drying' AND label='Secado'`, 1},
		{`SELECT count(*) FROM catalog.attribute_definitions WHERE key='product_form' AND label='Forma del producto'`, 1},
		{`SELECT count(*) FROM catalog.attribute_definitions WHERE key='fine_or_flavour' AND label='Fino o de aroma (declaración del comerciante)'`, 1},
		{`SELECT count(*) FROM catalog.attribute_definitions WHERE key='grind' AND allowed_values::text LIKE '%Grano entero%' AND allowed_values::text LIKE '%Fina%' AND allowed_values::text LIKE '%Media%' AND allowed_values::text LIKE '%Gruesa%'`, 1},
		{`SELECT count(*) FROM catalog.attribute_definitions WHERE key='process' AND allowed_values::text LIKE '%Lavado%'`, 1},
		{`SELECT count(*) FROM catalog.attribute_definitions WHERE key='roast_level' AND allowed_values::text LIKE '%Clara%' AND allowed_values::text LIKE '%Media%' AND allowed_values::text LIKE '%Oscura%'`, 1},
		{`SELECT count(*) FROM catalog.origin_images WHERE alt_text LIKE '%Paisaje%'`, 2},
		{`SELECT count(*) FROM catalog.product_images WHERE alt_text LIKE 'Empaque%'`, 4},
		{`SELECT count(*) FROM catalog.products WHERE slug='finca-el-mirador' AND description LIKE 'Café lavado demo%'`, 1},
		{`SELECT count(*) FROM catalog.products WHERE slug='finca-el-mirador' AND (attributes->>'tasting_notes') = 'Cítricos, panela y chocolate (demo)'`, 1},
	} {
		if got := scalar[int](t, db, tc.query); got != tc.want {
			t.Errorf("%s: got %d, want %d", tc.query, got, tc.want)
		}
	}
	if got := scalar[int](t, db, `SELECT COALESCE(sum(s.quantity),0) FROM catalog.variant_lot_stock s JOIN catalog.product_variants v ON v.id=s.variant_id WHERE v.sku='MIRADOR-500-COARSE'`); got != 0 {
		t.Errorf("sold-out variant stock = %d, want 0", got)
	}
	for _, tc := range []struct{ sku, date string }{
		{"MIRADOR-250-WHOLE_BEAN", "2026-10-01"},
		{"MIRADOR-250-FINE", "2026-10-08"},
	} {
		got := scalar[string](t, db, `SELECT l.production_date::text FROM catalog.lots l
			JOIN catalog.variant_lot_stock s ON s.lot_id=l.id JOIN catalog.product_variants v ON v.id=s.variant_id
			WHERE v.sku=$1 AND s.quantity>0 AND l.status='active' ORDER BY l.production_date,l.id LIMIT 1`, tc.sku)
		if got != tc.date {
			t.Errorf("oldest available lot date for %s = %s, want %s", tc.sku, got, tc.date)
		}
	}
	if got := scalar[int](t, db, `SELECT count(*) FROM catalog.variant_lot_stock s WHERE s.quantity<>(SELECT COALESCE(sum(m.quantity_delta),0) FROM catalog.inventory_movements m WHERE m.variant_id=s.variant_id AND m.lot_id=s.lot_id)`); got != 0 {
		t.Errorf("%d stock counters disagree with receipt ledger", got)
	}
}

func TestDemoSeedFailureRollsBackEverything(t *testing.T) {
	db, _ := database(t)
	if err := postgres.Migrate(t.Context(), db); err != nil {
		t.Fatal(err)
	}
	execSQL(t, db, `ALTER TABLE catalog.product_variants ADD CONSTRAINT reject_demo_variant CHECK (sku<>'MIRADOR-500-COARSE')`)
	before := catalogSnapshot(t, db)
	if err := postgres.Seed(t.Context(), db); err == nil {
		t.Fatal("seed unexpectedly accepted rejected demo variant")
	}
	assertSameCatalog(t, db, before)
}

func TestSeedCommand(t *testing.T) {
	binary := buildCommand(t, "seed")
	code, stdout, stderr := command(t, binary, "")
	assertLog(t, code, stdout, stderr, "ERROR", "demo catalog, shipping and orders seed failed", "DATABASE_URL is required")
	code, stdout, stderr = command(t, binary, "", "-h")
	wantHelp := "Usage: seed\nLoad idempotent demo data in order: catalog, shipping, orders, into an already migrated development database.\nNever run against production. Existing rows, prices and stock are not reset.\nEnvironment: DATABASE_URL is required.\nOptions: -module all|catalog|shipping|orders (default all).\n"
	if code != 0 || stdout != "" || stderr != wantHelp {
		t.Fatalf("help exit/stdout/stderr = %d/%q/%q", code, stdout, stderr)
	}
	db, url := database(t)
	migrate := buildCommand(t, "migrate")
	code, stdout, stderr = command(t, migrate, url)
	assertLog(t, code, stdout, stderr, "INFO", "catalog, shipping, orders, payments, identity and notifications migrations applied", "")
	code, stdout, stderr = command(t, binary, url)
	assertLog(t, code, stdout, stderr, "INFO", "demo catalog, shipping and orders seeded", "")
	assertDemo(t, db)
	if scalar[int](t, db, `SELECT count(*) FROM orders.orders`) != 0 || scalar[int](t, db, `SELECT count(*) FROM orders.outbox`) != 0 {
		t.Fatal("seed invented orders or events")
	}
	if scalar[int](t, db, `SELECT count(*) FROM shipping.shipping_zones`) != 3 || scalar[int](t, db, `SELECT count(*) FROM shipping.shipping_rates`) != 6 {
		t.Fatal("default seed did not load demo shipping coverage")
	}
	before := catalogSnapshot(t, db)
	shippingBefore := scalar[string](t, db, `SELECT jsonb_agg(to_jsonb(r) ORDER BY id)::text FROM shipping.shipping_rates r`)
	code, stdout, stderr = command(t, binary, url)
	assertLog(t, code, stdout, stderr, "INFO", "demo catalog, shipping and orders seeded", "")
	assertSameCatalog(t, db, before)
	if scalar[string](t, db, `SELECT jsonb_agg(to_jsonb(r) ORDER BY id)::text FROM shipping.shipping_rates r`) != shippingBefore {
		t.Fatal("repeated default seed changed shipping rates")
	}
}
