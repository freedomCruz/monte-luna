package domain_test

import (
	"github.com/freedomCruz/monte-luna/backend/internal/payments/domain"
	"testing"
)

func TestProviderStatusesAndTerminalGuard(t *testing.T) {
	for _, status := range []string{"PENDING", "APPROVED", "DECLINED", "VOIDED", "ERROR"} {
		mapped, err := domain.ProviderStatus(status)
		if err != nil || mapped == "" {
			t.Fatalf("status %s: %v", status, err)
		}
	}
	if _, err := domain.ProviderStatus("UNKNOWN"); err == nil {
		t.Fatal("unknown status accepted")
	}
	for _, status := range []string{"approved", "declined", "voided", "error", "expired", "duplicate_approved"} {
		if !domain.Terminal(status) {
			t.Fatalf("%s is not terminal", status)
		}
	}
	if domain.Terminal("created") || domain.Terminal("pending") {
		t.Fatal("nonterminal treated as terminal")
	}
}
