package domain_test

import (
	"github.com/freedomCruz/monte-luna/backend/internal/orders/domain"
	"testing"
	"time"
)

func TestAdminFilterCalendarAndValidation(t *testing.T) {
	now := time.Date(2026, 11, 3, 3, 0, 0, 0, time.UTC) // Still November 2 in Bogota.
	f, err := domain.ParseAdminFilter(nil, now)
	if err != nil || f.Limit != 25 || f.Sort != "-placed_at" || f.From.Format(time.RFC3339) != "2026-10-04T05:00:00Z" || f.To.Format(time.RFC3339) != "2026-11-03T05:00:00Z" {
		t.Fatalf("filter=%+v error=%v", f, err)
	}
	for _, tt := range []struct {
		name string
		q    map[string][]string
	}{
		{"unknown", map[string][]string{"bad": {"x"}}},
		{"limit", map[string][]string{"limit": {"24"}}},
		{"repeated singleton", map[string][]string{"sort": {"placed_at", "-placed_at"}}},
		{"state", map[string][]string{"status": {"refunded"}}},
		{"method", map[string][]string{"payment_method_type": {"cash"}}},
		{"date mode", map[string][]string{"date_filter": {"year"}}},
		{"bounds without range", map[string][]string{"date_filter": {"all"}, "from_date": {"2026-11-01"}}},
		{"reversed range", map[string][]string{"date_filter": {"range"}, "from_date": {"2026-11-02"}, "to_date": {"2026-11-01"}}},
		{"invalid calendar", map[string][]string{"date_filter": {"range"}, "from_date": {"2026-02-30"}, "to_date": {"2026-11-01"}}},
	} {
		t.Run(tt.name, func(t *testing.T) {
			if _, err := domain.ParseAdminFilter(tt.q, now); err == nil {
				t.Fatal("invalid filter accepted")
			}
		})
	}
	rangeFilter, err := domain.ParseAdminFilter(map[string][]string{"date_filter": {"range"}, "from_date": {"2026-11-01"}, "to_date": {"2026-11-01"}, "limit": {"100"}}, now)
	if err != nil || rangeFilter.From.Format(time.RFC3339) != "2026-11-01T05:00:00Z" || rangeFilter.To.Format(time.RFC3339) != "2026-11-02T05:00:00Z" {
		t.Fatalf("range=%+v/%v", rangeFilter, err)
	}
}
