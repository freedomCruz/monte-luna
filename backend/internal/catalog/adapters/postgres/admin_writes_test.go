package postgres_test

import (
	"encoding/json"
	"errors"
	"fmt"
	"github.com/freedomCruz/monte-luna/backend/internal/catalog/adapters/postgres"
	"github.com/freedomCruz/monte-luna/backend/internal/catalog/domain"
	"github.com/jackc/pgx/v5/pgxpool"
	"testing"
)

func writeFields(t *testing.T, body string) map[string]json.RawMessage {
	t.Helper()
	var out map[string]json.RawMessage
	if err := json.Unmarshal([]byte(body), &out); err != nil {
		t.Fatal(err)
	}
	return out
}
func TestAdminProductVariantWrites(t *testing.T) {
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
	source := scalar[string](t, db, `SELECT id FROM catalog.products WHERE slug='finca-el-mirador'`)
	p, err := repo.AdminProduct(t.Context(), source)
	if err != nil {
		t.Fatal(err)
	}
	body, _ := json.Marshal(p.Attributes)
	create := fmt.Sprintf(`{"product_type_id":%q,"title":"New","slug":"write-test","attributes":%s}`, p.ProductType.ID, body)
	got, err := repo.WriteAdmin(t.Context(), domain.AdminWrite{Kind: "create-product", Fields: writeFields(t, create)})
	if err != nil || got.Product == nil || got.Product.Version != 1 {
		t.Fatalf("create %+v %v", got, err)
	}
	id := got.Product.ID
	reject := func(kind string, version int32, body, code string) {
		t.Helper()
		before := catalogSnapshot(t, db)
		_, err := repo.WriteAdmin(t.Context(), domain.AdminWrite{Kind: kind, ProductID: id, Version: version, Fields: writeFields(t, body)})
		var problem *domain.Error
		if !errors.As(err, &problem) || problem.Code != code {
			t.Fatalf("%s: %v", body, err)
		}
		assertSameCatalog(t, db, before)
	}
	reject("create-product", 0, create, "slug_conflict")
	reject("update-product", 1, `{"title":""}`, "validation_failed")
	reject("update-product", 2, `{"title":"stale"}`, "version_conflict")
	reject("update-product", 1, `{"category_ids":["01946894-3d9a-7c98-b807-6c84c1762c30"]}`, "validation_failed")
	options, _ := json.Marshal(p.Variants[0].Options)
	variant := fmt.Sprintf(`{"sku":"WRITE-TEST","options":%s,"attributes":{},"price_amount":100,"weight_grams":250,"tax_category":"excluded"}`, options)
	reject("create-variant", 1, `{"sku":"BAD","options":{"undefined":"bad"},"attributes":{},"price_amount":100,"weight_grams":250,"tax_category":"excluded"}`, "validation_failed")
	got, err = repo.WriteAdmin(t.Context(), domain.AdminWrite{Kind: "create-variant", ProductID: id, Version: 1, Fields: writeFields(t, variant)})
	if err != nil || got.Variant == nil || got.ProductVersion != 2 || got.Variant.Version != 1 || got.Variant.AvailableQuantity != 0 {
		t.Fatalf("variant %+v %v", got, err)
	}
	vid := got.Variant.ID
	duplicate := fmt.Sprintf(`{"sku":"WRITE-OTHER","options":%s,"attributes":{},"price_amount":100,"weight_grams":250,"tax_category":"excluded"}`, options)
	reject("create-variant", 2, duplicate, "variant_options_conflict")
	reject("create-variant", 2, variant, "sku_conflict")
	for _, patch := range []string{`{"compare_at_price_amount":100}`, `{"compare_at_price_amount":99}`, `{"weight_grams":0}`, `{"options":{"roast_level":"medium"}}`} {
		before := catalogSnapshot(t, db)
		_, err := repo.WriteAdmin(t.Context(), domain.AdminWrite{Kind: "update-variant", ProductID: id, VariantID: vid, Version: 2, Fields: writeFields(t, patch)})
		if err == nil {
			t.Fatalf("accepted %s", patch)
		}
		assertSameCatalog(t, db, before)
	}
	got, err = repo.WriteAdmin(t.Context(), domain.AdminWrite{Kind: "update-variant", ProductID: id, VariantID: vid, Version: 2, Fields: writeFields(t, `{"compare_at_price_amount":101}`)})
	if err != nil || got.ProductVersion != 3 || got.Variant.Version != 2 {
		t.Fatalf("patch %+v %v", got, err)
	}
	before := catalogSnapshot(t, db)
	_, err = repo.WriteAdmin(t.Context(), domain.AdminWrite{Kind: "update-variant", ProductID: id, VariantID: vid, Version: 3, Fields: writeFields(t, `{"price_amount":101}`)})
	if err == nil {
		t.Fatal("retained reference not checked")
	}
	assertSameCatalog(t, db, before)
	got, err = repo.WriteAdmin(t.Context(), domain.AdminWrite{Kind: "update-product", ProductID: id, Version: 3, Fields: writeFields(t, `{"description":"new","status":"archived"}`)})
	if err != nil || got.Product.Title != "New" || got.Product.Description == nil || got.Product.Version != 4 {
		t.Fatalf("merge %+v %v", got, err)
	}
	// Merge patches retain omitted descriptive keys and validate required keys.
	before = catalogSnapshot(t, db)
	_, err = repo.WriteAdmin(t.Context(), domain.AdminWrite{Kind: "update-product", ProductID: source, Version: 1, Fields: writeFields(t, `{"attributes":{"roast_level":null}}`)})
	if err == nil {
		t.Fatal("required product attribute removed")
	}
	assertSameCatalog(t, db, before)
	imageEdits := make([]map[string]any, 0, len(p.Images))
	for _, image := range p.Images {
		imageEdits = append(imageEdits, map[string]any{"id": image.ID, "alt_text": image.AltText, "variant_id": image.VariantID, "position": image.Position})
	}
	imageEdits[0]["alt_text"] = "Changed image"
	patch, err := json.Marshal(map[string]any{"images": imageEdits, "attributes": map[string]any{"tasting_notes": nil, "cupping_score": 90}})
	if err != nil {
		t.Fatal(err)
	}
	changed, err := repo.WriteAdmin(t.Context(), domain.AdminWrite{Kind: "update-product", ProductID: source, Version: 1, Fields: writeFields(t, string(patch))})
	if err != nil || changed.Product.Version != 2 || changed.Product.Attributes["tasting_notes"] != nil || changed.Product.Attributes["species"] != "arabica" || len(changed.Product.Categories) != len(p.Categories) || changed.Product.Images[0].Version != p.Images[0].Version+1 {
		t.Fatalf("product/image merge %+v %v", changed, err)
	}
	for i := 1; i < len(p.Images); i++ {
		if changed.Product.Images[i].Version != p.Images[i].Version {
			t.Fatal("unchanged image version bumped")
		}
	}
	// An invalid image edit cannot partially update the preceding images.
	before = catalogSnapshot(t, db)
	imageEdits = append(imageEdits, imageEdits[0])
	badImages, _ := json.Marshal(map[string]any{"title": "must rollback", "images": imageEdits})
	if _, err = repo.WriteAdmin(t.Context(), domain.AdminWrite{Kind: "update-product", ProductID: source, Version: 2, Fields: writeFields(t, string(badImages))}); err == nil {
		t.Fatal("duplicate image accepted")
	}
	assertSameCatalog(t, db, before)
	// A late database error must undo categories and parent edits as well.
	execSQL(t, db, `CREATE FUNCTION catalog.reject_test_product() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test update failure'; END $$; CREATE TRIGGER reject_test_product BEFORE UPDATE ON catalog.products FOR EACH ROW EXECUTE FUNCTION catalog.reject_test_product()`)
	before = catalogSnapshot(t, db)
	_, err = repo.WriteAdmin(t.Context(), domain.AdminWrite{Kind: "update-product", ProductID: id, Version: 4, Fields: writeFields(t, `{"title":"fail"}`)})
	if err == nil {
		t.Fatal("late error ignored")
	}
	assertSameCatalog(t, db, before)
}
