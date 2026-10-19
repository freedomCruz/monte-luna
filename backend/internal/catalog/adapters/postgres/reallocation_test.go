package postgres_test

import (
	"github.com/freedomCruz/monte-luna/backend/internal/catalog"
	"github.com/freedomCruz/monte-luna/backend/internal/catalog/adapters/postgres"
	"testing"
)

func TestReleasedOrderReallocationIsIdempotent(t *testing.T) {
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
	ref := "0199c4e2-7a1b-7c3d-9e0f-1a2b3c4d5e6f"
	items := []catalog.StockRequest{{VariantID: id, Quantity: 1}}
	if _, err := module.Allocate(t.Context(), ref, items); err != nil {
		t.Fatal(err)
	}
	if err := module.Release(t.Context(), ref); err != nil {
		t.Fatal(err)
	}
	if _, err := module.Allocate(t.Context(), ref, items); err == nil {
		t.Fatal("ordinary allocation reused reference")
	}
	got, err := module.Reallocate(t.Context(), ref, items)
	if err != nil || len(got) != 1 || got[0].Quantity != 1 {
		t.Fatalf("late allocation=%+v %v", got, err)
	}
	before := catalogSnapshot(t, db)
	replay, err := module.Reallocate(t.Context(), ref, items)
	if err != nil || len(replay) != 1 || replay[0] != got[0] {
		t.Fatalf("late allocation replay=%+v %v", replay, err)
	}
	assertSameCatalog(t, db, before)
}
