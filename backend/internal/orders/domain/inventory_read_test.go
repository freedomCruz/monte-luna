package domain_test

import (
	"github.com/freedomCruz/monte-luna/backend/internal/orders/domain"
	"testing"
)

func TestInventoryReservationState(t *testing.T) {
	for _, tt := range []struct{ status, want string }{
		{"pending_payment", "held"}, {"paid", "committed"}, {"preparing", "committed"}, {"shipped", "committed"}, {"delivered", "committed"}, {"cancelled", "released"}, {"expired", "released"},
	} {
		t.Run(tt.status, func(t *testing.T) {
			if got := domain.InventoryReservationState(tt.status); got != tt.want {
				t.Fatalf("got %s want %s", got, tt.want)
			}
		})
	}
}
