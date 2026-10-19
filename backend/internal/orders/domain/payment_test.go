package domain_test

import (
	"github.com/freedomCruz/monte-luna/backend/internal/orders/domain"
	"testing"
	"time"
)

func TestPaymentTransitionAndGrace(t *testing.T) {
	for _, tt := range []struct {
		status string
		stock  bool
		want   string
	}{{"pending_payment", true, "paid"}, {"expired", true, "paid"}, {"expired", false, "cancelled"}, {"paid", true, ""}, {"preparing", true, ""}, {"shipped", true, ""}, {"delivered", true, ""}, {"cancelled", true, ""}} {
		if got := domain.PaymentTransition(tt.status, tt.stock); got != tt.want {
			t.Fatalf("%s -> %s want %s", tt.status, got, tt.want)
		}
	}
	placed := time.Date(2026, 10, 16, 18, 0, 0, 0, time.UTC)
	for _, tt := range []struct {
		deadline, now time.Duration
		pending       bool
		want          time.Duration
	}{{30 * time.Minute, 30 * time.Minute, true, 45 * time.Minute}, {110 * time.Minute, 110 * time.Minute, true, 120 * time.Minute}, {120 * time.Minute, 120 * time.Minute, true, 0}, {30 * time.Minute, 30 * time.Minute, false, 0}} {
		got, ok := domain.PaymentGrace(placed, placed.Add(tt.deadline), placed.Add(tt.now), tt.pending)
		if ok != (tt.want != 0) || (ok && !got.Equal(placed.Add(tt.want))) {
			t.Fatalf("grace %v %v", got, ok)
		}
	}
}
