package app_test

import (
	"context"
	"github.com/freedomCruz/monte-luna/backend/internal/orders/app"
	"testing"
	"time"
)

type expiryRepository struct{ expiry, cleanup time.Time }

func (r *expiryRepository) Expire(_ context.Context, now time.Time, release func(context.Context, string) error) (int, error) {
	r.expiry = now
	return 1, release(context.Background(), id)
}
func (r *expiryRepository) Cleanup(_ context.Context, now time.Time) error {
	r.cleanup = now
	return nil
}
func TestMaintenanceUsesInjectedClock(t *testing.T) {
	f := &placementFixture{clock: time.Date(2026, 10, 15, 13, 0, 0, 0, time.UTC)}
	r := &expiryRepository{}
	job := app.NewMaintenance(r, f, f)
	n, err := job.Run(t.Context())
	if err != nil || n != 1 || f.released != 1 || !r.expiry.Equal(f.clock) || !r.cleanup.Equal(f.clock) {
		t.Fatalf("count=%d error=%v expiry=%v cleanup=%v", n, err, r.expiry, r.cleanup)
	}
}
