package domain_test

import (
	"errors"
	"testing"

	"github.com/freedomCruz/monte-luna/backend/internal/identity/domain"
)

func TestAdminValidation(t *testing.T) {
	for _, tc := range []struct {
		name, email, role, status string
		valid                     bool
	}{
		{"owner", "OWNER@example.test", "owner", "active", true},
		{"staff", "staff@example.test", "staff", "disabled", true},
		{"invalid email", "not-email", "owner", "active", false},
		{"display address", "User <user@example.test>", "owner", "active", false},
		{"unknown role", "a@example.test", "superuser", "active", false},
		{"unknown status", "a@example.test", "owner", "deleted", false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			u, err := domain.NewUser(tc.email, "Admin", domain.Role(tc.role), domain.Status(tc.status))
			if (err == nil) != tc.valid {
				t.Fatalf("valid=%v err=%v", tc.valid, err)
			}
			if tc.valid && u.Email != "owner@example.test" && tc.name == "owner" {
				t.Fatal("email not normalized")
			}
		})
	}
	if _, err := domain.NewUser("a@example.test", " ", domain.Owner, domain.Active); !errors.Is(err, domain.ErrValidation) {
		t.Fatal("blank name accepted")
	}
}

func TestLastOwnerAndSessionInvalidation(t *testing.T) {
	owner := domain.User{Email: "a@example.test", DisplayName: "A", Role: domain.Owner, Status: domain.Active, Version: 3, SessionVersion: 4}
	for _, tc := range []struct {
		name           string
		change         domain.UserChanges
		owners         int
		wantErr        error
		sessionVersion int32
	}{
		{"last owner disable", domain.UserChanges{Status: ptr(domain.Disabled)}, 1, domain.ErrLastActiveOwner, 0},
		{"last owner demote", domain.UserChanges{Role: ptr(domain.Staff)}, 1, domain.ErrLastActiveOwner, 0},
		{"disable with second owner", domain.UserChanges{Status: ptr(domain.Disabled)}, 2, nil, 5},
		{"demote with second owner", domain.UserChanges{Role: ptr(domain.Staff)}, 2, nil, 5},
		{"profile only", domain.UserChanges{DisplayName: ptr("New")}, 1, nil, 4},
		{"unchanged role", domain.UserChanges{Role: ptr(domain.Owner)}, 1, nil, 4},
		{"invalid role", domain.UserChanges{Role: ptr(domain.Role("root"))}, 2, domain.ErrValidation, 0},
	} {
		t.Run(tc.name, func(t *testing.T) {
			got, err := owner.Apply(tc.change, tc.owners)
			if !errors.Is(err, tc.wantErr) {
				t.Fatalf("error %v want %v", err, tc.wantErr)
			}
			if err == nil && (got.SessionVersion != tc.sessionVersion || got.Version != 4) {
				t.Fatalf("versions %+v", got)
			}
			if owner.SessionVersion != 4 || owner.Role != domain.Owner || owner.Status != domain.Active {
				t.Fatal("input mutated")
			}
		})
	}
}
func ptr[T any](value T) *T { return &value }
