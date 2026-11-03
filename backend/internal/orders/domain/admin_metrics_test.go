package domain_test

import (
	"github.com/freedomCruz/monte-luna/backend/internal/orders/domain"
	"testing"
	"time"
)

func TestAdminMetricPeriods(t *testing.T) {
	if domain.Average(5, 2) != 3 || domain.Average(0, 0) != 0 || domain.Comparison(0, 0).Delta != nil {
		t.Fatal("invalid empty/rounded metric comparison")
	}

	now := time.Date(2026, 11, 3, 6, 30, 0, 0, time.UTC)
	for _, tt := range []struct {
		period         string
		buckets        int
		from, previous string
	}{
		{"today", 2, "2026-11-03T05:00:00Z", "2026-11-02T05:00:00Z"},
		{"last_7_days", 7, "2026-10-28T05:00:00Z", "2026-10-22T03:30:00Z"},
		{"last_30_days", 30, "2026-10-05T05:00:00Z", "2026-09-06T03:30:00Z"},
	} {
		t.Run(tt.period, func(t *testing.T) {
			got, err := domain.ResolveMetricPeriod(map[string][]string{"period": {tt.period}}, now)
			if err != nil || got.From.Format(time.RFC3339) != tt.from || got.PreviousFrom.Format(time.RFC3339) != tt.previous || !got.To.Equal(now) || len(got.Buckets) != tt.buckets {
				t.Fatalf("period=%+v err=%v", got, err)
			}
			if got.To.Sub(got.From) != got.PreviousTo.Sub(got.PreviousFrom) {
				t.Fatal("comparison duration differs")
			}
		})
	}
	for _, q := range []map[string][]string{
		{"period": {"range"}, "from_date": {"2026-11-01"}, "to_date": {"2026-11-04"}},
		{"period": {"range"}, "from_date": {"2026-11-02"}, "to_date": {"2026-11-01"}},
		{"period": {"today"}, "from_date": {"2026-11-01"}},
		{"period": {"invalid"}},
	} {
		if _, err := domain.ResolveMetricPeriod(q, now); err == nil {
			t.Fatalf("invalid range accepted: %v", q)
		}
	}
	got, err := domain.ResolveMetricPeriod(map[string][]string{"period": {"range"}, "from_date": {"2026-11-01"}, "to_date": {"2026-11-01"}}, now)
	if err != nil || len(got.Buckets) != 1 || got.To.Format(time.RFC3339) != "2026-11-02T05:00:00Z" {
		t.Fatalf("custom=%+v err=%v", got, err)
	}
}
