package domain_test

import (
	"errors"
	"strings"
	"testing"

	"github.com/freedomCruz/monte-luna/backend/internal/identity/domain"
)

func TestLengthPasswordPolicyCountsCodePoints(t *testing.T) {
	policy := domain.LengthPolicy(12, 128)
	for _, tc := range []struct {
		name, password string
		valid          bool
	}{
		{"eleven", strings.Repeat("a", 11), false},
		{"twelve", strings.Repeat("a", 12), true},
		{"twelve multibyte", strings.Repeat("ñ", 12), true},
		{"no composition rules", "aaaaaaaaaaaaaaaa", true},
		{"maximum", strings.Repeat("é", 128), true},
		{"too long", strings.Repeat("a", 129), false},
		{"invalid utf-8", strings.Repeat("a", 12) + "\xff", false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			err := policy(tc.password)
			if tc.valid != (err == nil) || (err != nil && !errors.Is(err, domain.ErrValidation)) {
				t.Fatalf("valid=%v err=%v", tc.valid, err)
			}
		})
	}
}
