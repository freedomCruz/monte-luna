package postgres_test

import (
	"github.com/freedomCruz/monte-luna/backend/internal/catalog"
	"github.com/freedomCruz/monte-luna/backend/internal/catalog/adapters/postgres"
	"testing"
)

func TestCheckoutFacadeLiveSnapshot(t *testing.T) {
	db, url := database(t)
	if err := postgres.Migrate(t.Context(), db); err != nil {
		t.Fatal(err)
	}
	if err := postgres.Seed(t.Context(), db); err != nil {
		t.Fatal(err)
	}
	module, err := catalog.New(t.Context(), url, "https://media.example/", nil)
	if err != nil {
		t.Fatal(err)
	}
	defer module.Close()
	id := scalar[string](t, db, `SELECT id FROM catalog.product_variants WHERE sku='MIRADOR-250-WHOLE_BEAN'`)
	before := catalogSnapshot(t, db)
	variants, err := module.CheckoutVariants(t.Context(), []string{id, "0199c4e2-7a1b-7c3d-9e0f-1a2b3c4d5e6f"})
	if err != nil || len(variants) != 1 {
		t.Fatalf("%+v/%v", variants, err)
	}
	got := variants[0]
	stock := scalar[int64](t, db, `SELECT sum(s.quantity) FROM catalog.variant_lot_stock s JOIN catalog.lots l ON l.id=s.lot_id WHERE s.variant_id=$1 AND l.status='active'`, id)
	if got.ID != id || got.ProductID == "" || got.ProductSlug != "finca-el-mirador" || got.ProductTitle != "Finca El Mirador" || got.VariantLabel != "250 g / Grano entero" || got.SKU != "MIRADOR-250-WHOLE_BEAN" || got.PriceAmount != 3800000 || got.Currency != "COP" || got.WeightGrams != 250 || got.TaxCategory != "excluded" || got.AvailableStock != stock || got.ProductStatus != "published" || got.Status != "active" {
		t.Fatalf("variant=%+v", got)
	}
	assertSameCatalog(t, db, before)
	execSQL(t, db, `UPDATE catalog.product_variants SET price_amount=3900000,status='archived' WHERE id=$1`, id)
	execSQL(t, db, `UPDATE catalog.products SET status='draft' WHERE id=$1`, got.ProductID)
	execSQL(t, db, `UPDATE catalog.lots SET status='archived' WHERE product_id=$1`, got.ProductID)
	variants, err = module.CheckoutVariants(t.Context(), []string{id})
	if err != nil {
		t.Fatal(err)
	}
	if variants[0].PriceAmount != 3900000 || variants[0].Status != "archived" || variants[0].ProductStatus != "draft" || variants[0].AvailableStock != 0 {
		t.Fatalf("stale checkout state: %+v", variants[0])
	}
}
