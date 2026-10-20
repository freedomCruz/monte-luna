// Package identity exposes the module's safe cross-module authorization facade.
package identity

import (
	"context"

	"github.com/freedomCruz/monte-luna/backend/internal/identity/domain"
)

// Principal contains no credential, session token, counter or session version.
type Principal struct {
	ID   string `json:"id"`
	Role string `json:"role"`
}

// AccessChecker is the only interface other modules need. They receive this
// already-wired facade; only the composition root constructs its dependencies.
type AccessChecker interface {
	Require(context.Context, string) (Principal, error)
}
type PolicyChecker interface {
	Authorize(context.Context, domain.Session, string) (domain.User, error)
}
type SessionReader interface {
	Current(context.Context, domain.Stage) (domain.Session, error)
}
type Authorizer struct {
	checker  PolicyChecker
	sessions SessionReader
}

func NewAuthorizer(checker PolicyChecker, sessions SessionReader) (*Authorizer, error) {
	if checker == nil || sessions == nil {
		return nil, domain.ErrValidation
	}
	return &Authorizer{checker, sessions}, nil
}

// Require must run inside SCS LoadAndSave. Its application policy rechecks the
// current active role and session_version, not a role cached in the cookie.
func (a *Authorizer) Require(ctx context.Context, resource string) (Principal, error) {
	session, err := a.sessions.Current(ctx, domain.Authenticated)
	if err != nil {
		return Principal{}, err
	}
	user, err := a.checker.Authorize(ctx, session, resource)
	if err != nil {
		return Principal{}, err
	}
	return Principal{ID: user.ID, Role: string(user.Role)}, nil
}
