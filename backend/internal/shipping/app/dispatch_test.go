package app_test

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/freedomCruz/monte-luna/backend/internal/shipping/app"
	"github.com/freedomCruz/monte-luna/backend/internal/shipping/domain"
)

type dispatchRepo struct {
	calls   int
	guarded *bool
	err     error
	input   domain.DispatchInput
	now     time.Time
}

func (r *dispatchRepo) Dispatch(_ context.Context, in domain.DispatchInput, now time.Time) (domain.Shipment, error) {
	if !*r.guarded {
		panic("persistence outside order guard")
	}
	r.calls++
	r.input = in
	r.now = now
	return domain.Shipment{OrderID: in.OrderID, Status: "shipped", Version: 2}, r.err
}

type dispatchGuard struct {
	calls  int
	active bool
	err    error
}

func (g *dispatchGuard) WithDispatchOrder(ctx context.Context, _ string, _ int32, fn func(context.Context) error) error {
	g.calls++
	if g.err != nil {
		return g.err
	}
	g.active = true
	defer func() { g.active = false }()
	return fn(ctx)
}
func TestDispatchOrderGuardAndValidation(t *testing.T) {
	now := time.Date(2026, 11, 3, 15, 0, 0, 0, time.UTC)
	for _, tt := range []struct {
		name                  string
		invalid               bool
		guardErr, repoErr     error
		repoCalls, guardCalls int
	}{
		{name: "success", repoCalls: 1, guardCalls: 1},
		{name: "reject invalid before guard", invalid: true},
		{name: "order conflict", guardErr: domain.ErrVersionConflict, guardCalls: 1},
		{name: "shipping failure", repoErr: errors.New("database failure"), repoCalls: 1, guardCalls: 1},
	} {
		t.Run(tt.name, func(t *testing.T) {
			g := &dispatchGuard{err: tt.guardErr}
			r := &dispatchRepo{guarded: &g.active, err: tt.repoErr}
			service, err := app.NewDispatch(r, g, func() time.Time { return now })
			if err != nil {
				t.Fatal(err)
			}
			in := domain.DispatchInput{OrderID: "01946894-3d9a-7c98-b807-6c84c1762c2f", ActorID: "01946894-3d9a-7c98-b807-6c84c1762c2f", OrderVersion: 1, CarrierName: " Carrier "}
			if tt.invalid {
				in.CarrierName = ""
			}
			got, err := service.Dispatch(t.Context(), in)
			if (err != nil) != (tt.invalid || tt.guardErr != nil || tt.repoErr != nil) {
				t.Fatalf("error=%v", err)
			}
			if r.calls != tt.repoCalls || g.calls != tt.guardCalls || g.active {
				t.Fatalf("repo=%d guard=%d active=%v", r.calls, g.calls, g.active)
			}
			if err == nil && (got.Status != "shipped" || got.Version != 2 || r.input.CarrierName != "Carrier" || !r.now.Equal(now)) {
				t.Fatalf("shipment=%+v input=%+v", got, r.input)
			}
		})
	}
}
