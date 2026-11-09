package postgres_test

import (
	"github.com/freedomCruz/monte-luna/backend/internal/catalog/adapters/postgres"
	"github.com/freedomCruz/monte-luna/backend/internal/catalog/domain"
	"github.com/jackc/pgx/v5/pgxpool"
	"testing"
)

func TestAdminCatalogQueries(t *testing.T) {
	db, url := database(t)
	if err := postgres.Migrate(t.Context(), db); err != nil {
		t.Fatal(err)
	}
	if err := postgres.Seed(t.Context(), db); err != nil {
		t.Fatal(err)
	}
	pool, err := pgxpool.New(t.Context(), url)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()
	repo := postgres.NewRepository(pool)
	filter := func(kind, id string, values map[string][]string) domain.AdminReadFilter {
		t.Helper()
		f, err := domain.ParseAdminReadFilter(kind, id, values)
		if err != nil {
			t.Fatal(err)
		}
		return f
	}
	product := scalar[string](t, db, `SELECT id FROM catalog.products WHERE slug='finca-el-mirador'`)
	variant := scalar[string](t, db, `SELECT id FROM catalog.product_variants WHERE sku='MIRADOR-250-WHOLE_BEAN'`)
	before := catalogSnapshot(t, db)
	p, err := repo.AdminProduct(t.Context(), product)
	if err != nil || p.ID != product || len(p.Variants) == 0 || len(p.ProductType.Definitions) == 0 || len(p.Images) == 0 || p.Images[0].StorageKey == "" {
		t.Fatalf("product %+v %v", p, err)
	}
	for _, kind := range []string{"categories", "origins", "brands", "product-types"} {
		got, err := repo.AdminTaxonomy(t.Context(), filter(kind, "", nil))
		if err != nil || got.Total == 0 {
			t.Fatalf("%s %+v %v", kind, got, err)
		}
	}
	for _, tt := range []struct {
		search string
		want   int64
	}{{"MIRADOR-250-WHOLE_BEAN", 1}, {"%", 2}, {"%_", 0}, {"  ", 4}} {
		got, err := repo.AdminProducts(t.Context(), filter("products", "", map[string][]string{"search": {tt.search}}))
		if err != nil || got.Total != tt.want {
			t.Fatalf("search %q %+v %v", tt.search, got, err)
		}
	}
	inv, err := repo.AdminInventory(t.Context(), filter("inventory-detail", variant, nil))
	if err != nil || len(inv.Items) != 1 || inv.Items[0].VariantLabel == "" || inv.Items[0].AvailableQuantity == 0 {
		t.Fatalf("inventory %+v %v", inv, err)
	}
	lots, kind, err := repo.AdminLots(t.Context(), filter("lots", variant, nil))
	if err != nil || kind != "coffee" || len(lots.Items) == 0 || !lots.Items[0].NextToAllocate {
		t.Fatalf("lots %+v %v", lots, err)
	}
	movements, err := repo.AdminMovements(t.Context(), filter("movements", variant, nil))
	if err != nil || len(movements.Items) == 0 {
		t.Fatalf("movements %+v %v", movements, err)
	}
	assertSameCatalog(t, db, before)
	execSQL(t, db, `INSERT INTO catalog.lots(product_id,lot_code,production_date,status) VALUES ($1,'ARCHIVED-TEST','2026-01-01','archived')`, product)
	execSQL(t, db, `INSERT INTO catalog.variant_lot_stock(product_id,variant_id,lot_id,quantity) SELECT $1,$2,id,999 FROM catalog.lots WHERE product_id=$1 AND lot_code='ARCHIVED-TEST'`, product, variant)
	withoutArchived, err := repo.AdminInventory(t.Context(), filter("inventory-detail", variant, nil))
	if err != nil || withoutArchived.Items[0].AvailableQuantity != inv.Items[0].AvailableQuantity || withoutArchived.Items[0].ActiveLotCount != inv.Items[0].ActiveLotCount {
		t.Fatalf("archived lot counted %+v %v", withoutArchived, err)
	}
	// Active variant/lot counters only; archived variants stay in full detail.
	execSQL(t, db, `UPDATE catalog.product_variants SET status='archived' WHERE product_id=$1`, product)
	got, err := repo.AdminProducts(t.Context(), filter("products", "", map[string][]string{"search": {"MIRADOR-250-WHOLE_BEAN"}}))
	if err != nil {
		t.Fatal(err)
	}
	for _, v := range got.Items {
		if v.ID == product && (v.MinPriceAmount != nil || v.MaxPriceAmount != nil || v.AvailableQuantity != 0 || v.VariantCount != 0) {
			t.Fatalf("archived aggregate %+v", v)
		}
	}
	p, err = repo.AdminProduct(t.Context(), product)
	if err != nil || len(p.Variants) == 0 || p.Variants[0].Status != "archived" {
		t.Fatalf("archived children %+v %v", p, err)
	}
	execSQL(t, db, `UPDATE catalog.product_variants SET status='active' WHERE product_id=$1;`, product)
	// Generate enough rows for every cursor path, including tied keys and null
	// prices in both directions. Lists must never fall back to an offset.
	execSQL(t, db, `INSERT INTO catalog.products(product_type_id,title,slug,status) SELECT product_type_id,'Tie','page-'||n,'draft' FROM catalog.products CROSS JOIN generate_series(1,30) n WHERE id=$1`, product)
	for _, sort := range []string{"title", "-title", "stock", "-stock", "price_amount", "-price_amount"} {
		values := map[string][]string{"sort": {sort}}
		seen := map[string]bool{}
		pages := 0
		for {
			page, err := repo.AdminProducts(t.Context(), filter("products", "", values))
			if err != nil {
				t.Fatal(err)
			}
			if len(page.Items) > 25 || page.Total != 34 {
				t.Fatalf("sort %s page %+v", sort, page)
			}
			for _, v := range page.Items {
				if seen[v.ID] {
					t.Fatal("duplicate product cursor")
				}
				seen[v.ID] = true
			}
			pages++
			if page.NextCursor == nil {
				break
			}
			if pages > 3 {
				t.Fatal("cursor loop")
			}
			values["cursor"] = []string{*page.NextCursor}
		}
		if len(seen) != 34 || pages != 2 {
			t.Fatalf("sort %s seen %d pages %d", sort, len(seen), pages)
		}
	}
	for _, kind := range []string{"categories", "origins", "brands", "product-types"} {
		switch kind {
		case "categories":
			execSQL(t, db, `INSERT INTO catalog.categories(name,slug,position,status) SELECT 'Tie','page-'||n,0,'active' FROM generate_series(1,30) n`)
		case "origins":
			execSQL(t, db, `INSERT INTO catalog.origins(name,slug,producer_name,country_code,status) SELECT 'Tie','page-'||n,'Producer','CO','active' FROM generate_series(1,30) n`)
		case "brands":
			execSQL(t, db, `INSERT INTO catalog.brands(name,slug,status) SELECT 'Tie','page-'||n,'active' FROM generate_series(1,30) n`)
		default:
			execSQL(t, db, `INSERT INTO catalog.product_types(name,slug) SELECT 'Tie','page-'||n FROM generate_series(1,30) n`)
		}
		page, err := repo.AdminTaxonomy(t.Context(), filter(kind, "", nil))
		if err != nil || page.NextCursor == nil {
			t.Fatalf("%s page %+v %v", kind, page, err)
		}
		next, err := repo.AdminTaxonomy(t.Context(), filter(kind, "", map[string][]string{"cursor": {*page.NextCursor}}))
		if err != nil || next.NextCursor != nil || next.Total != page.Total {
			t.Fatalf("%s next %+v %v", kind, next, err)
		}
	}
	// More than 25 variants on a product, lots on a variant and tied movements.
	execSQL(t, db, `INSERT INTO catalog.product_variants(product_id,sku,options,price_amount,weight_grams,tax_category,status,position)
 SELECT $1,'PAGE-'||n,jsonb_build_object('presentation',n::text),100,250,'excluded','active',0 FROM generate_series(1,30) n`, product)
	page, err := repo.AdminInventory(t.Context(), filter("inventory", "", map[string][]string{"product_id": {product}}))
	if err != nil || page.NextCursor == nil {
		t.Fatalf("inventory page %+v %v", page, err)
	}
	next, err := repo.AdminInventory(t.Context(), filter("inventory", "", map[string][]string{"product_id": {product}, "cursor": {*page.NextCursor}}))
	if err != nil || next.NextCursor != nil || next.Total != page.Total {
		t.Fatalf("inventory next %+v %v", next, err)
	}
	execSQL(t, db, `INSERT INTO catalog.lots(product_id,lot_code,production_date,status) SELECT $1,'PAGE-'||n,'2026-01-01','depleted' FROM generate_series(1,30) n`, product)
	execSQL(t, db, `INSERT INTO catalog.variant_lot_stock(product_id,variant_id,lot_id,quantity) SELECT $1,$2,id,0 FROM catalog.lots WHERE product_id=$1 AND lot_code LIKE 'PAGE-%'`, product, variant)
	lotpage, _, err := repo.AdminLots(t.Context(), filter("lots", variant, nil))
	if err != nil || lotpage.NextCursor == nil {
		t.Fatalf("lot page %+v %v", lotpage, err)
	}
	lotnext, _, err := repo.AdminLots(t.Context(), filter("lots", variant, map[string][]string{"cursor": {*lotpage.NextCursor}}))
	if err != nil || lotnext.NextCursor != nil || lotnext.Total != lotpage.Total {
		t.Fatalf("lot next %+v %v", lotnext, err)
	}
	execSQL(t, db, `INSERT INTO catalog.inventory_movements(variant_id,lot_id,quantity_delta,reason,created_at) SELECT $1,lot_id,1,'receipt','2026-11-01T00:00:00Z' FROM catalog.variant_lot_stock WHERE variant_id=$1`, variant)
	move, err := repo.AdminMovements(t.Context(), filter("movements", variant, nil))
	if err != nil || move.NextCursor == nil {
		t.Fatalf("move page %+v %v", move, err)
	}
	movenext, err := repo.AdminMovements(t.Context(), filter("movements", variant, map[string][]string{"cursor": {*move.NextCursor}}))
	if err != nil || movenext.NextCursor != nil || movenext.Total != move.Total {
		t.Fatalf("move next %+v %v", movenext, err)
	}
	for _, v := range movenext.Items {
		for _, first := range move.Items {
			if v.ID == first.ID {
				t.Fatal("duplicate movement cursor")
			}
		}
	}
	execSQL(t, db, `INSERT INTO catalog.product_types(name,slug) VALUES ('Custom','custom');
 INSERT INTO catalog.attribute_definitions(product_type_id,key,label,data_type,scope,is_variant_option,is_required,is_filterable,allowed_values,position)
 SELECT id,'flavors','Flavors','multi_option','variant',true,true,false,'[{"value":"smooth","label":"Smooth"},{"value":"bright","label":"Bright"}]',0 FROM catalog.product_types WHERE slug='custom';
 INSERT INTO catalog.products(product_type_id,title,slug,status) SELECT id,'Custom','custom','draft' FROM catalog.product_types WHERE slug='custom';
 INSERT INTO catalog.product_variants(product_id,sku,options,price_amount,weight_grams,tax_category,status,position) SELECT id,'CUSTOM','{"flavors":["bright","smooth"]}',100,250,'excluded','active',0 FROM catalog.products WHERE slug='custom';`)
	customID := scalar[string](t, db, `SELECT id FROM catalog.products WHERE slug='custom'`)
	custom, err := repo.AdminInventory(t.Context(), filter("inventory", "", map[string][]string{"product_id": {customID}}))
	if err != nil || len(custom.Items) != 1 || custom.Items[0].VariantLabel != "Bright, Smooth" {
		t.Fatalf("merchant-defined labels %+v %v", custom, err)
	}
	t.Log("product sorts 6; taxonomy cursors 4; inventory, lots and movement cursors verified")
}
