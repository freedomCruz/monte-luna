package domain_test

import (
	"github.com/freedomCruz/monte-luna/backend/internal/payments/domain"
	"testing"
)

func TestIntegritySignature(t *testing.T) {
	// Independent known SHA-256 fixture of the exact concatenation.
	got := domain.IntegritySignature("REF123", 4500000, "COP", "2026-10-16T18:00:00Z", "fixture-integrity")
	if got != "f90258b55d312c7a1463f5f459d09143363af0bc457fbea69c5f7e7d3ead09d5" {
		t.Fatalf("signature = %s", got)
	}
}
func TestCompletedRefundCannotExceedAttempt(t *testing.T) {
	for _, tt := range []struct {
		name                         string
		amount, completed, requested int64
		valid                        bool
	}{{"full", 100, 0, 100, true}, {"remaining", 100, 40, 60, true}, {"excess", 100, 40, 61, false}, {"zero", 100, 0, 0, false}, {"negative", 100, 0, -1, false}} {
		t.Run(tt.name, func(t *testing.T) {
			if (domain.ValidateRefund(tt.amount, tt.completed, tt.requested) == nil) != tt.valid {
				t.Fatal("incorrect refund invariant")
			}
		})
	}
}
