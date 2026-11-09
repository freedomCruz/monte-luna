package postgres_test

import (
	"context"
	"errors"
	"testing"

	"github.com/freedomCruz/monte-luna/backend/internal/catalog/adapters/postgres"
	"github.com/freedomCruz/monte-luna/backend/internal/catalog/domain"
	"github.com/jackc/pgx/v5/pgxpool"
)

func TestImageTransactionAndDurableCompensation(t *testing.T) {
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
	in := domain.ImageUpload{ProductID: product, ProductVersion: 1, VariantID: &variant, AltText: "Bag", Position: 5}
	if err := repo.CheckImageTarget(t.Context(), in); err != nil {
		t.Fatal(err)
	}
	res := domain.ImageReservation{ID: "01946894-3d9a-7c98-b807-6c84c1762c30", ProductID: product, StorageKey: "catalog/products/" + product + "/01946894-3d9a-7c98-b807-6c84c1762c30.png"}
	if err := repo.ReserveImage(t.Context(), res); err != nil {
		t.Fatal(err)
	}
	got, err := repo.AttachImage(t.Context(), res, in)
	if err != nil || got.Version != 1 || got.ProductVersion != 2 || got.StorageKey != res.StorageKey {
		t.Fatalf("attach %+v %v", got, err)
	}
	read, err := repo.AdminImage(t.Context(), product, res.ID)
	if err != nil || read.ProductVersion != 2 || read.VariantID == nil || *read.VariantID != variant {
		t.Fatalf("read %+v %v", read, err)
	}
	// An ambiguous commit must not compensate an object whose image committed.
	deleted := 0
	if err := repo.DiscardImage(t.Context(), res.ID, func(context.Context, string) error { deleted++; return nil }); err != nil || deleted != 0 {
		t.Fatalf("deleted committed object: %v %d", err, deleted)
	}
	before := catalogSnapshot(t, db)
	failed := domain.ImageReservation{ID: "01946894-3d9a-7c98-b807-6c84c1762c31", ProductID: product, StorageKey: "catalog/products/" + product + "/01946894-3d9a-7c98-b807-6c84c1762c31.png"}
	if err := repo.ReserveImage(t.Context(), failed); err != nil {
		t.Fatal(err)
	}
	_, err = repo.AttachImage(t.Context(), failed, in)
	var problem *domain.Error
	if !errors.As(err, &problem) || problem.Code != "version_conflict" {
		t.Fatalf("stale: %v", err)
	}
	assertSameCatalog(t, db, before)
	if err := repo.DiscardImage(t.Context(), failed.ID, func(context.Context, string) error { return errors.New("provider unavailable") }); err == nil {
		t.Fatal("expected cleanup failure")
	}
	if n := scalar[int](t, db, `SELECT count(*) FROM catalog.media_uploads WHERE id=$1`, failed.ID); n != 1 {
		t.Fatal("orphan key was lost")
	}
	if err := repo.DiscardImage(t.Context(), failed.ID, func(_ context.Context, key string) error {
		if key != failed.StorageKey {
			t.Error("wrong cleanup key")
		}
		return nil
	}); err != nil {
		t.Fatal(err)
	}
	if n := scalar[int](t, db, `SELECT count(*) FROM catalog.media_uploads`); n != 0 {
		t.Fatal("ticket not removed")
	}
	// Force a late insert failure after the parent UPDATE: transaction rolls back.
	if err := repo.ReserveImage(t.Context(), failed); err != nil {
		t.Fatal(err)
	}
	in.ProductVersion = 2
	execSQL(t, db, `CREATE FUNCTION catalog.reject_test_image() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test insert failure'; END $$; CREATE TRIGGER reject_test_image BEFORE INSERT ON catalog.product_images FOR EACH ROW EXECUTE FUNCTION catalog.reject_test_image()`)
	if _, err := repo.AttachImage(t.Context(), failed, in); err == nil {
		t.Fatal("insert failure accepted")
	}
	assertSameCatalog(t, db, before)
	execSQL(t, db, `DROP TRIGGER reject_test_image ON catalog.product_images; DROP FUNCTION catalog.reject_test_image()`)
	foreign := scalar[string](t, db, `SELECT id FROM catalog.product_variants WHERE sku='CHOCOLATE-70-80'`)
	in.VariantID = &foreign
	if err := repo.CheckImageTarget(t.Context(), in); err == nil {
		t.Fatal("cross-product image accepted")
	}
	assertSameCatalog(t, db, before)
}
