package domain_test

import (
	"github.com/freedomCruz/monte-luna/backend/internal/identity/domain"
	"testing"
)

func TestFixedRoleAuthorization(t *testing.T) {
	for _, role := range []domain.Role{domain.Owner, domain.Staff, "root"} {
		for _, resource := range []string{"catalog", "inventory", "orders", "identity-self", "identity", "invoicing", "payments", "shipping", "promotions", "notifications", "unknown", ""} {
			want := role == domain.Owner && resource != "unknown" && resource != "" || role == domain.Staff && (resource == "catalog" || resource == "inventory" || resource == "orders" || resource == "identity-self")
			if domain.CanAccess(role, resource) != want {
				t.Fatalf("authorization mismatch for %s/%s", role, resource)
			}
		}
	}
}
