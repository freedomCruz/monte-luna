package postgres_test

import (
	"context"
	"errors"
	"fmt"
	"github.com/freedomCruz/monte-luna/backend/internal/catalog/adapters/postgres"
	"github.com/freedomCruz/monte-luna/backend/internal/catalog/domain"
	"github.com/jackc/pgx/v5/pgxpool"
	"sync"
	"testing"
)

func TestAdminReceiptTransaction(t *testing.T) {
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
	product := scalar[string](t, db, `SELECT id FROM catalog.products WHERE slug='finca-el-mirador'`)
	variant := scalar[string](t, db, `SELECT id FROM catalog.product_variants WHERE sku='MIRADOR-250-WHOLE_BEAN'`)
	const actor = "01946894-3d9a-7c98-b807-6c84c1762c30"
	receipt := func(version int32, body string) (domain.AdminWriteResult, error) {
		return repo.WriteAdmin(t.Context(), domain.AdminWrite{Kind: "receipt", VariantID: variant, Version: version, ActorID: actor, Fields: writeFields(t, body)})
	}
	body := `{"lot_code":" B3-NEW ","production_date":"2026-11-01","quantity":2,"note":" test receipt "}`
	got, err := receipt(1, body)
	if err != nil || got.Receipt == nil {
		t.Fatalf("receipt %+v %v", got, err)
	}
	r := got.Receipt
	if !r.LotCreated || r.ProductID != product || r.QuantityAfter != 2 || r.QuantityReceived != 2 || r.ProductVersion != 2 || r.LotCode != "B3-NEW" || r.Reason != "receipt" {
		t.Fatalf("%+v", r)
	}
	if n := scalar[int](t, db, `SELECT count(*) FROM catalog.inventory_movements WHERE id=$1 AND actor_id=$2 AND reason='receipt' AND quantity_delta=2 AND reference_id IS NULL AND note='test receipt'`, r.MovementID, actor); n != 1 {
		t.Fatal("movement not exact")
	}
	reject := func(version int32, body, code string) {
		t.Helper()
		before := catalogSnapshot(t, db)
		_, err := receipt(version, body)
		var problem *domain.Error
		if !errors.As(err, &problem) || problem.Code != code {
			t.Fatalf("%s: %v", body, err)
		}
		assertSameCatalog(t, db, before)
	}
	reject(1, body, "version_conflict")
	for _, q := range []int{0, -1} {
		reject(2, fmt.Sprintf(`{"lot_code":"B3-NEW","production_date":"2026-11-01","quantity":%d}`, q), "validation_failed")
	}
	reject(2, `{"lot_code":"B3-NEW","production_date":"2026-11-02","quantity":1}`, "lot_conflict")
	reject(2, `{"lot_code":"B3-NEW","production_date":"2026-11-01","expiration_date":"2026-11-02","quantity":1}`, "lot_conflict")
	reject(2, `{"lot_code":"B3-NEW","production_date":"2026-11-01","expiration_date":"2026-10-31","quantity":1}`, "validation_failed")
	reject(2, `{"lot_code":"B3-NEW","production_date":"2026-11-01","quantity":2147483647}`, "validation_failed")
	reject(2, fmt.Sprintf(`{"lot_code":"B3-NEW","lot_id":%q,"production_date":"2026-11-01","quantity":1}`, r.LotID), "validation_failed")
	execSQL(t, db, `UPDATE catalog.lots SET status='archived' WHERE id=$1`, r.LotID)
	reject(2, body, "lot_conflict")
	execSQL(t, db, `UPDATE catalog.lots SET status='depleted' WHERE id=$1`, r.LotID)
	got, err = receipt(2, body)
	if err != nil || got.Receipt.LotCreated || got.Receipt.QuantityAfter != 4 {
		t.Fatalf("reuse %+v %v", got, err)
	}
	if v := scalar[int](t, db, `SELECT version FROM catalog.lots WHERE id=$1 AND status='active'`, r.LotID); v != 2 {
		t.Fatalf("reactivated version %d", v)
	}
	got, err = receipt(3, body)
	if err != nil || got.Receipt.QuantityAfter != 6 {
		t.Fatalf("active receipt %+v %v", got, err)
	}
	if v := scalar[int](t, db, `SELECT version FROM catalog.lots WHERE id=$1`, r.LotID); v != 2 {
		t.Fatal("unchanged lot bumped")
	}
	// A same-code lot of another product cannot be reused. The public receipt
	// resolves the selected variant's product instead of accepting a lot ID.
	other := scalar[string](t, db, `SELECT id FROM catalog.products WHERE slug='chocolate-70'`)
	execSQL(t, db, `INSERT INTO catalog.lots(product_id,lot_code,production_date,status) VALUES($1,'FOREIGN-CODE','2026-11-01','active')`, other)
	got, err = receipt(4, `{"lot_code":"FOREIGN-CODE","production_date":"2026-11-01","quantity":1}`)
	if err != nil || !got.Receipt.LotCreated || got.Receipt.ProductID != product {
		t.Fatalf("foreign lot %+v %v", got, err)
	}
	if count := scalar[int](t, db, `SELECT count(*) FROM catalog.variant_lot_stock s JOIN catalog.lots l ON l.id=s.lot_id WHERE s.variant_id=$1 AND l.product_id<>s.product_id`, variant); count != 0 {
		t.Fatal("cross-product stock")
	}
	// Force a failure after lot creation and stock upsert: all state rolls back.
	execSQL(t, db, `CREATE FUNCTION catalog.reject_receipt() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test movement failure'; END $$; CREATE TRIGGER reject_receipt BEFORE INSERT ON catalog.inventory_movements FOR EACH ROW EXECUTE FUNCTION catalog.reject_receipt()`)
	before := catalogSnapshot(t, db)
	if _, err = receipt(5, `{"lot_code":"ROLLBACK","production_date":"2026-11-01","quantity":1}`); err == nil {
		t.Fatal("failed ledger committed")
	}
	assertSameCatalog(t, db, before)
	execSQL(t, db, `DROP TRIGGER reject_receipt ON catalog.inventory_movements; DROP FUNCTION catalog.reject_receipt()`)
	// Two callers share the exact version and start together. Only one can commit.
	race := func(kind, body string, version int32) {
		t.Helper()
		start := make(chan struct{})
		results := make(chan error, 2)
		var wg sync.WaitGroup
		for range 2 {
			wg.Go(func() {
				<-start
				_, err := repo.WriteAdmin(context.Background(), domain.AdminWrite{Kind: kind, ProductID: product, VariantID: variant, Version: version, ActorID: actor, Fields: writeFields(t, body)})
				results <- err
			})
		}
		close(start)
		wg.Wait()
		close(results)
		ok, conflicts := 0, 0
		for err := range results {
			if err == nil {
				ok++
			} else {
				var p *domain.Error
				if errors.As(err, &p) && p.Status == 412 && p.Code == "version_conflict" {
					conflicts++
				} else {
					t.Fatal(err)
				}
			}
		}
		if ok != 1 || conflicts != 1 {
			t.Fatalf("success %d conflicts %d", ok, conflicts)
		}
	}
	race("receipt", `{"lot_code":"RACE","production_date":"2026-11-01","quantity":3}`, 5)
	if q := scalar[int](t, db, `SELECT quantity FROM catalog.variant_lot_stock s JOIN catalog.lots l ON l.id=s.lot_id WHERE s.variant_id=$1 AND l.lot_code='RACE'`, variant); q != 3 {
		t.Fatal("receipt double counted")
	}
	if n := scalar[int](t, db, `SELECT count(*) FROM catalog.inventory_movements m JOIN catalog.lots l ON l.id=m.lot_id WHERE m.variant_id=$1 AND l.lot_code='RACE'`, variant); n != 1 {
		t.Fatal("duplicate movement")
	}
	race("update-product", `{"title":"Race winner"}`, 6)
	if v := scalar[int](t, db, `SELECT version FROM catalog.products WHERE id=$1`, product); v != 7 {
		t.Fatalf("version %d", v)
	}
}
