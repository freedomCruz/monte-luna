package identity_test

import (
	"context"
	"errors"
	"testing"

	"github.com/freedomCruz/monte-luna/backend/internal/identity"
	"github.com/freedomCruz/monte-luna/backend/internal/identity/domain"
)

type sessionReader struct{ err error }

func (s sessionReader) Current(_ context.Context, stage domain.Stage) (domain.Session, error) {
	if stage != domain.Authenticated {
		return domain.Session{}, errors.New("wrong stage")
	}
	return domain.Session{UserID: "actor", Version: 1, Stage: stage}, s.err
}

type policy struct {
	err    error
	called bool
}

func (p *policy) Authorize(_ context.Context, s domain.Session, resource string) (domain.User, error) {
	p.called = true
	if s.UserID != "actor" || resource != "orders" {
		return domain.User{}, errors.New("invalid delegation")
	}
	return domain.User{ID: "actor", Role: domain.Staff, PasswordHash: "never expose"}, p.err
}
func TestPublicAuthorizationFacade(t *testing.T) {
	for _, tc := range []struct {
		name                  string
		sessionErr, policyErr error
		called                bool
	}{{name: "allowed", called: true}, {name: "pending or revoked", sessionErr: domain.ErrAuthenticationRequired}, {name: "forbidden", policyErr: domain.ErrForbidden, called: true}} {
		t.Run(tc.name, func(t *testing.T) {
			p := &policy{err: tc.policyErr}
			a, err := identity.NewAuthorizer(p, sessionReader{tc.sessionErr})
			if err != nil {
				t.Fatal(err)
			}
			principal, err := a.Require(t.Context(), "orders")
			want := tc.sessionErr
			if want == nil {
				want = tc.policyErr
			}
			if !errors.Is(err, want) || p.called != tc.called {
				t.Fatal("authorization delegation mismatch")
			}
			if err == nil && (principal.ID != "actor" || principal.Role != "staff") {
				t.Fatal("invalid principal")
			}
		})
	}
	if _, err := identity.NewAuthorizer(nil, sessionReader{}); err == nil {
		t.Fatal("missing checker accepted")
	}
}
