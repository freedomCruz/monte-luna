// Package session binds SCS state to the identity application's revocation check.
package session

import (
	"context"
	"net/http"
	"time"

	"github.com/alexedwards/scs/v2"
	"github.com/freedomCruz/monte-luna/backend/internal/identity/domain"
)

// Config limits are enforced twice: SCS applies them with real time as the
// outer bound, and Current applies them with Now (the module clock).
type Config struct {
	Lifetime        time.Duration
	IdleTimeout     time.Duration
	PendingLifetime time.Duration
	// Now defaults to time.Now.
	Now func() time.Time
}
type Validator interface {
	Validate(context.Context, domain.Session, domain.Stage) (domain.User, error)
}
type Sessions struct {
	Manager   *scs.SessionManager
	validator Validator
	config    Config
}

func New(store scs.Store, validator Validator, config Config) (*Sessions, error) {
	if store == nil || validator == nil || config.Lifetime <= 0 || config.IdleTimeout <= 0 || config.IdleTimeout > config.Lifetime || config.PendingLifetime <= 0 || config.PendingLifetime > config.Lifetime {
		return nil, domain.ErrValidation
	}
	if config.Now == nil {
		config.Now = time.Now
	}
	manager := scs.New()
	manager.Store = store
	manager.Lifetime = config.Lifetime
	manager.IdleTimeout = config.IdleTimeout
	manager.HashTokenInStore = true
	manager.Cookie.Name = "__Host-session"
	manager.Cookie.Path = "/"
	manager.Cookie.Domain = ""
	manager.Cookie.Secure = true
	manager.Cookie.HttpOnly = true
	manager.Cookie.SameSite = http.SameSiteLaxMode
	// SCS' default error handler logs errors. Do not log potentially sensitive
	// persistence errors or cookie contents; the HTTP adapter owns safe metrics.
	manager.ErrorFunc = func(w http.ResponseWriter, _ *http.Request, _ error) {
		w.Header().Set("Cache-Control", "no-store")
		http.Error(w, "Internal Server Error", http.StatusInternalServerError)
	}
	return &Sessions{manager, validator, config}, nil
}

// Replace must be called only with the result of a successful app use case.
// Both password and MFA transitions rotate tokens and erase previous payloads.
func (s *Sessions) Replace(ctx context.Context, state domain.Session) error {
	if state.UserID == "" || state.Version < 1 || (state.Stage != domain.EnrollmentRequired && state.Stage != domain.TOTPRequired && state.Stage != domain.Authenticated) {
		return domain.ErrAuthenticationRequired
	}
	if _, err := s.validator.Validate(ctx, state, state.Stage); err != nil {
		return err
	}
	if err := s.Manager.RenewToken(ctx); err != nil {
		return err
	}
	if err := s.Manager.Clear(ctx); err != nil {
		return err
	}
	s.Manager.Put(ctx, "identity_user", state.UserID)
	s.Manager.Put(ctx, "identity_version", state.Version)
	s.Manager.Put(ctx, "identity_stage", string(state.Stage))
	now := s.config.Now().UnixNano()
	s.Manager.Put(ctx, "identity_issued", now)
	s.Manager.Put(ctx, "identity_seen", now)
	lifetime := s.config.Lifetime
	if state.Stage != domain.Authenticated {
		lifetime = s.config.PendingLifetime
	}
	s.Manager.SetDeadline(ctx, time.Now().Add(lifetime))
	return nil
}

// State is untrusted until Current validates it. Logout alone may use State to
// identify the audit actor before destroying even an expired/revoked session.
func (s *Sessions) State(ctx context.Context) domain.Session {
	return domain.Session{UserID: s.Manager.GetString(ctx, "identity_user"), Version: s.Manager.GetInt32(ctx, "identity_version"), Stage: domain.Stage(s.Manager.GetString(ctx, "identity_stage"))}
}
func (s *Sessions) Current(ctx context.Context, stage domain.Stage) (domain.Session, error) {
	state := s.State(ctx)
	if state.UserID == "" || state.Version < 1 || state.Stage != stage {
		return domain.Session{}, domain.ErrAuthenticationRequired
	}
	if !s.Manager.Deadline(ctx).After(time.Now()) {
		return domain.Session{}, domain.ErrAuthenticationRequired
	}
	if !s.fresh(ctx, stage) {
		return domain.Session{}, domain.ErrAuthenticationRequired
	}
	if _, err := s.validator.Validate(ctx, state, stage); err != nil {
		return domain.Session{}, err
	}
	if stage == domain.Authenticated {
		s.Manager.Put(ctx, "identity_seen", s.config.Now().UnixNano())
	}
	return state, nil
}
func (s *Sessions) Destroy(ctx context.Context) error { return s.Manager.Destroy(ctx) }

// fresh applies the absolute, idle and pending limits with the module clock.
// A limit reached exactly is still valid; sessions lacking timestamps are not.
func (s *Sessions) fresh(ctx context.Context, stage domain.Stage) bool {
	issued, seen := s.Manager.GetInt64(ctx, "identity_issued"), s.Manager.GetInt64(ctx, "identity_seen")
	if issued == 0 || seen == 0 {
		return false
	}
	now := s.config.Now()
	if stage != domain.Authenticated {
		return now.Sub(time.Unix(0, issued)) <= s.config.PendingLifetime
	}
	return now.Sub(time.Unix(0, issued)) <= s.config.Lifetime && now.Sub(time.Unix(0, seen)) <= s.config.IdleTimeout
}
