package domain_test

import (
	"github.com/freedomCruz/monte-luna/backend/internal/orders/domain"
	"testing"
	"time"
)

func TestReservationExpiryBoundary(t *testing.T) {
	now := time.Date(2026, 10, 15, 12, 30, 0, 0, time.UTC)
	for _, tc := range []struct {
		status   string
		deadline time.Time
		want     bool
	}{{"pending_payment", now, true}, {"pending_payment", now.Add(-time.Second), true}, {"pending_payment", now.Add(time.Second), false}, {"expired", now, false}, {"paid", now, false}, {"cancelled", now, false}} {
		if got := domain.ReservationExpired(tc.status, tc.deadline, now); got != tc.want {
			t.Fatalf("%s/%s=%v", tc.status, tc.deadline, got)
		}
	}
}
