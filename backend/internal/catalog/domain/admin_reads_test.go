package domain_test

import (
	"github.com/freedomCruz/monte-luna/backend/internal/catalog/domain"
	"testing"
	"time"
)

func TestAdminStockAndRoastBoundaries(t *testing.T) {
	for _, tt := range []struct {
		quantity int64
		want     bool
	}{{0, true}, {9, true}, {10, false}} {
		if got := domain.LowStock(tt.quantity); got != tt.want {
			t.Fatalf("quantity %d: %v", tt.quantity, got)
		}
	}
	for _, tt := range []struct {
		kind, date, at string
		want           bool
	}{
		{"coffee", "2026-10-01", "2026-11-01T04:59:59Z", false},
		{"coffee", "2026-10-01", "2026-11-01T05:00:00Z", true},
		{"cacao", "2026-10-01", "2026-11-01T05:00:00Z", false},
		{"coffee", "2026-11-02", "2026-11-01T05:00:00Z", false},
	} {
		at, err := time.Parse(time.RFC3339, tt.at)
		if err != nil {
			t.Fatal(err)
		}
		if got := domain.OldRoast(tt.kind, tt.date, at); got != tt.want {
			t.Fatalf("%+v got %v", tt, got)
		}
	}
}
