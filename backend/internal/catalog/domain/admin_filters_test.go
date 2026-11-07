package domain_test

import (
	"github.com/freedomCruz/monte-luna/backend/internal/catalog/domain"
	"testing"
)

func TestAdminReadFiltersAndCursor(t *testing.T) {
	for _, tt := range []struct {
		kind   string
		values map[string][]string
		ok     bool
	}{
		{"products", nil, true}, {"products", map[string][]string{"limit": {"24"}}, false}, {"products", map[string][]string{"sort": {"-price_amount"}, "limit": {"100"}}, true},
		{"products", map[string][]string{"status": {"draft", "draft"}}, false}, {"products", map[string][]string{"category_id": {"invalid"}}, false},
		{"brands", map[string][]string{"search": {"x"}}, false}, {"product-types", map[string][]string{"status": {"active"}}, false},
		{"inventory", map[string][]string{"stock": {"low_or_empty"}}, true}, {"lots", map[string][]string{"sort": {"title"}}, false},
		{"products", map[string][]string{"search": {"a", "b"}}, false},
	} {
		_, err := domain.ParseAdminReadFilter(tt.kind, "", tt.values)
		if (err == nil) != tt.ok {
			t.Fatalf("%+v: %v", tt, err)
		}
	}
	f, err := domain.ParseAdminReadFilter("products", "", map[string][]string{"search": {"  coffee "}})
	if err != nil {
		t.Fatal(err)
	}
	n := int64(10)
	cursor := domain.AdminReadCursor(f, "01946894-3d9a-7c98-b807-6c84c1762c30", "coffee", &n)
	f2, err := domain.ParseAdminReadFilter("products", "", map[string][]string{"search": {"coffee"}, "cursor": {cursor}})
	if err != nil || f2.AnchorID == "" {
		t.Fatalf("roundtrip %+v %v", f2, err)
	}
	if _, err := domain.ParseAdminReadFilter("products", "", map[string][]string{"search": {"cacao"}, "cursor": {cursor}}); err == nil {
		t.Fatal("cursor accepted changed filters")
	}
	for _, kind := range []string{"lots", "movements", "categories", "inventory"} {
		f, err := domain.ParseAdminReadFilter(kind, "", nil)
		if err != nil {
			t.Fatal(err)
		}
		cursor := domain.AdminReadCursor(f, "01946894-3d9a-7c98-b807-6c84c1762c30", "invalid date", nil)
		if _, err := domain.ParseAdminReadFilter(kind, "", map[string][]string{"cursor": {cursor}}); err == nil {
			t.Fatalf("%s accepted malformed cursor key", kind)
		}
	}
}
