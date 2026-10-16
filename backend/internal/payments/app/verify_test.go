package app_test

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/freedomCruz/monte-luna/backend/internal/payments/app"
	"github.com/freedomCruz/monte-luna/backend/internal/payments/domain"
)

type reconcileRepo struct {
	attempt *domain.Attempt
	applied int
}

func (r *reconcileRepo) Latest(context.Context, string) (*domain.Attempt, error) {
	return r.attempt, nil
}
func (r *reconcileRepo) ByReference(_ context.Context, order, reference string) (*domain.Attempt, error) {
	if r.attempt != nil && r.attempt.OrderID == order && r.attempt.Reference == reference {
		return r.attempt, nil
	}
	return nil, nil
}
func (r *reconcileRepo) Apply(_ context.Context, tx domain.Transaction, _ string, _ time.Time) error {
	r.applied++
	r.attempt.Status, _ = domain.ProviderStatus(tx.Status)
	r.attempt.Method = tx.Method
	return nil
}

type gateway struct {
	transaction *domain.Transaction
	calls       int
}

func (g *gateway) Fetch(context.Context, string, string) (*domain.Transaction, error) {
	g.calls++
	return g.transaction, nil
}
func TestVerifyHintOwnershipAmountCurrencyAndNoKnownID(t *testing.T) {
	for _, tt := range []struct {
		name, reference, currency string
		amount                    int64
		hint                      string
		code                      string
	}{{"valid", "REF", "COP", 4500000, "hint", ""}, {"wrong reference", "OTHER", "COP", 4500000, "hint", "payment_transaction_mismatch"}, {"wrong amount", "REF", "COP", 1, "hint", "payment_transaction_mismatch"}, {"wrong currency", "REF", "USD", 4500000, "hint", "payment_transaction_mismatch"}, {"no id", "REF", "COP", 4500000, "", ""}} {
		t.Run(tt.name, func(t *testing.T) {
			repo := &reconcileRepo{attempt: &domain.Attempt{OrderID: "order", Reference: "REF", Amount: 4500000, Currency: "COP", Status: "created"}}
			fake := &gateway{transaction: &domain.Transaction{ID: "hint", Reference: tt.reference, Currency: tt.currency, Amount: tt.amount, Status: "APPROVED"}}
			service := app.NewReconciliation(repo, orderPort{order: domain.Order{ID: "order"}}, fake, fixedClock{time.Now()})
			_, err := service.Verify(t.Context(), "token", tt.hint)
			if tt.code != "" {
				var known *domain.Error
				if !errors.As(err, &known) || known.Code != tt.code || repo.applied != 0 {
					t.Fatalf("mismatch changed state: %v", err)
				}
				return
			}
			if err != nil {
				t.Fatal(err)
			}
			if tt.hint == "" {
				if fake.calls != 0 || repo.applied != 0 || repo.attempt.Status != "created" {
					t.Fatal("no-id verification changed data")
				}
			} else if repo.applied != 1 {
				t.Fatal("verified hint not applied")
			}
		})
	}
}
