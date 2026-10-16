package app_test

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/freedomCruz/monte-luna/backend/internal/payments/app"
	"github.com/freedomCruz/monte-luna/backend/internal/payments/domain"
)

type fixedClock struct{ now time.Time }

func (c fixedClock) Now() time.Time { return c.now }

type fixedReference struct{}

func (fixedReference) Reference() (string, error) { return "REF123", nil }

type orderPort struct {
	order domain.Order
	err   error
}

func (p orderPort) Authorize(context.Context, string) (domain.Order, error) { return p.order, p.err }

type startTx struct {
	approved, pending, saved, committed bool
	replay                              *domain.Checkout
	attempt                             domain.Attempt
	checkout                            domain.Checkout
}

func (t *startTx) Replay(context.Context, string, time.Time) (*domain.Checkout, error) {
	return t.replay, nil
}
func (t *startTx) State(context.Context) (bool, bool, error) { return t.approved, t.pending, nil }
func (t *startTx) Save(_ context.Context, a domain.Attempt, c domain.Checkout, _ string, _ time.Time) error {
	t.saved = true
	t.attempt = a
	t.checkout = c
	return nil
}
func (t *startTx) Commit(context.Context) error   { t.committed = true; return nil }
func (t *startTx) Rollback(context.Context) error { return nil }

type startRepo struct{ tx *startTx }

func (r startRepo) BeginStart(context.Context, string, string) (domain.StartTx, error) {
	return r.tx, nil
}
func TestStartAuthoritativeCheckoutAndRefusals(t *testing.T) {
	now := time.Date(2026, 10, 16, 18, 0, 0, 0, time.UTC)
	for _, tt := range []struct {
		name, status      string
		expires           time.Time
		approved, pending bool
		code              string
	}{{"payable", "pending_payment", now.Add(time.Minute), false, false, ""}, {"paid", "paid", now.Add(time.Minute), false, false, "order_not_payable"}, {"expired", "pending_payment", now, false, false, "order_not_payable"}, {"approved", "pending_payment", now.Add(time.Minute), true, false, "order_not_payable"}, {"pending", "pending_payment", now.Add(time.Minute), false, true, "payment_pending"}} {
		t.Run(tt.name, func(t *testing.T) {
			tx := &startTx{approved: tt.approved, pending: tt.pending}
			order := domain.Order{ID: "order", Status: tt.status, Amount: 4500000, Currency: "COP", ExpiresAt: tt.expires}
			service := app.NewStart(startRepo{tx}, orderPort{order: order}, fixedClock{now}, fixedReference{}, app.CheckoutConfig{PublicKey: "pub_test", IntegritySecret: "fixture-integrity", StorefrontBaseURL: "https://store.test"})
			checkout, err := service.Start(t.Context(), "key", "tracking-token")
			if tt.code != "" {
				var problem *domain.Error
				if !errors.As(err, &problem) || problem.Code != tt.code || problem.Status != 409 {
					t.Fatalf("error=%v", err)
				}
				if tx.saved || tx.committed {
					t.Fatal("rejected start wrote state")
				}
				return
			}
			if err != nil {
				t.Fatal(err)
			}
			if !tx.saved || !tx.committed || tx.attempt.Status != "created" || tx.attempt.Amount != 4500000 || !tx.attempt.ExpiresAt.Equal(tt.expires) || checkout.Amount != 4500000 || checkout.Reference != "REF123" || checkout.RedirectURL != "https://store.test/pedido?token=tracking-token" || checkout.ExpiresAt != tt.expires.Format(time.RFC3339Nano) || checkout.IntegritySignature != domain.IntegritySignature("REF123", 4500000, "COP", checkout.ExpiresAt, "fixture-integrity") {
				t.Fatalf("incorrect authoritative checkout: %+v attempt %+v", checkout, tx.attempt)
			}
		})
	}
}
func TestStartReplaysBeforePayabilityChecks(t *testing.T) {
	tx := &startTx{approved: true, replay: &domain.Checkout{Reference: "original"}}
	service := app.NewStart(startRepo{tx}, orderPort{order: domain.Order{ID: "order", Status: "paid"}}, fixedClock{time.Now()}, fixedReference{}, app.CheckoutConfig{StorefrontBaseURL: "https://store.test"})
	result, err := service.Start(t.Context(), "key", "token")
	if err != nil || result.Reference != "original" || tx.saved {
		t.Fatalf("replay=%+v err=%v saved=%v", result, err, tx.saved)
	}
}
