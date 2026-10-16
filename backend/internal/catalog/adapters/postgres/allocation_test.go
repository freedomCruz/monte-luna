package postgres_test

import (
	"errors"
	"github.com/freedomCruz/monte-luna/backend/internal/catalog"
	"github.com/freedomCruz/monte-luna/backend/internal/catalog/adapters/postgres"
	"sync"
	"testing"
)

func TestAllocationOldestAtomicAndIdempotentRelease(t *testing.T) {
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
	before := scalar[int64](t, db, `SELECT sum(quantity) FROM catalog.variant_lot_stock WHERE variant_id=$1`, id)
	oldest := scalar[int32](t, db, `SELECT s.quantity FROM catalog.variant_lot_stock s JOIN catalog.lots l ON l.id=s.lot_id WHERE variant_id=$1 ORDER BY l.production_date,l.id LIMIT 1`, id)
	ref := "0199c4e2-7a1b-7c3d-9e0f-1a2b3c4d5e6f"
	got, err := module.Allocate(t.Context(), ref, []catalog.StockRequest{{VariantID: id, Quantity: oldest + 1}})
	if err != nil || len(got) != 2 || got[0].ProductionDate != "2026-10-01" || got[0].Quantity != oldest || got[1].ProductionDate != "2026-10-08" || got[1].Quantity != 1 {
		t.Fatalf("%+v/%v", got, err)
	}
	if scalar[int64](t, db, `SELECT sum(quantity) FROM catalog.variant_lot_stock WHERE variant_id=$1`, id) != before-int64(oldest+1) {
		t.Fatal("stock mismatch")
	}
	var wg sync.WaitGroup
	failures := make(chan error, 2)
	for range 2 {
		wg.Go(func() { failures <- module.Release(t.Context(), ref) })
	}
	wg.Wait()
	close(failures)
	for err := range failures {
		if err != nil {
			t.Fatal(err)
		}
	}
	if scalar[int64](t, db, `SELECT sum(quantity) FROM catalog.variant_lot_stock WHERE variant_id=$1`, id) != before {
		t.Fatal("release did not restore exactly once")
	}
	if scalar[int](t, db, `SELECT count(*) FROM catalog.inventory_movements WHERE reference_id=$1 AND reason='release'`, ref) != 2 {
		t.Fatal("duplicate/missing release movements")
	}
	snapshot := catalogSnapshot(t, db)
	if err := module.Release(t.Context(), ref); err != nil {
		t.Fatal(err)
	}
	assertSameCatalog(t, db, snapshot)
	// A later insufficient item must roll back earlier item counters and movements.
	sold := scalar[string](t, db, `SELECT id FROM catalog.product_variants WHERE sku='MIRADOR-500-COARSE'`)
	_, err = module.Allocate(t.Context(), "0199c4e2-7a1b-7c3d-9e0f-1a2b3c4d5e60", []catalog.StockRequest{{VariantID: id, Quantity: 1}, {VariantID: sold, Quantity: 1}})
	var shortage *catalog.InsufficientStockError
	if !errors.As(err, &shortage) {
		t.Fatalf("error=%v", err)
	}
	assertSameCatalog(t, db, snapshot)
}
func TestConcurrentAllocationLastUnit(t *testing.T) {
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
	execSQL(t, db, `UPDATE catalog.variant_lot_stock SET quantity=0 WHERE variant_id=$1`, id)
	execSQL(t, db, `UPDATE catalog.variant_lot_stock SET quantity=1 WHERE id=(SELECT id FROM catalog.variant_lot_stock WHERE variant_id=$1 ORDER BY lot_id LIMIT 1)`, id)
	start := make(chan struct{})
	results := make(chan error, 2)
	for _, ref := range []string{"0199c4e2-7a1b-7c3d-9e0f-1a2b3c4d5e61", "0199c4e2-7a1b-7c3d-9e0f-1a2b3c4d5e62"} {
		go func() {
			<-start
			_, err := module.Allocate(t.Context(), ref, []catalog.StockRequest{{VariantID: id, Quantity: 1}})
			results <- err
		}()
	}
	close(start)
	success, shortage := 0, 0
	for range 2 {
		err := <-results
		var stock *catalog.InsufficientStockError
		if err == nil {
			success++
		} else if errors.As(err, &stock) {
			shortage++
		} else {
			t.Fatal(err)
		}
	}
	if success != 1 || shortage != 1 || scalar[int](t, db, `SELECT min(quantity) FROM catalog.variant_lot_stock WHERE variant_id=$1`, id) < 0 {
		t.Fatalf("success=%d shortage=%d", success, shortage)
	}
}
