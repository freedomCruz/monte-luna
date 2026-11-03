package postgres_test

import (
	"github.com/freedomCruz/monte-luna/backend/internal/catalog"
	"reflect"
	"strings"
	"testing"
)

func TestPublicOrderImages(t *testing.T) {
	db, url := database(t)
	if err := catalog.Migrate(t.Context(), db); err != nil {
		t.Fatal(err)
	}
	if err := catalog.Seed(t.Context(), db); err != nil {
		t.Fatal(err)
	}
	m, err := catalog.New(t.Context(), url, "https://media.example/", nil)
	if err != nil {
		t.Fatal(err)
	}
	defer m.Close()
	id := scalar[string](t, db, `SELECT id FROM catalog.products WHERE slug='finca-el-mirador'`)
	execSQL(t, db, `UPDATE catalog.products SET status='archived' WHERE id=$1`, id)
	before := catalogSnapshot(t, db)
	images, err := m.OrderImages(t.Context(), []string{id})
	if err != nil || !strings.HasPrefix(images[id], "https://media.example/") {
		t.Fatalf("images=%v err=%v", images, err)
	}
	if !reflect.DeepEqual(before, catalogSnapshot(t, db)) {
		t.Fatal("image read modified data")
	}
}
