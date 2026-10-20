package session_test

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/alexedwards/scs/v2/memstore"
	"github.com/freedomCruz/monte-luna/backend/internal/identity/adapters/session"
	"github.com/freedomCruz/monte-luna/backend/internal/identity/domain"
)

type validator struct {
	version  int32
	disabled bool
}

func (v *validator) Validate(_ context.Context, s domain.Session, stage domain.Stage) (domain.User, error) {
	if v.disabled || s.Version != v.version || s.Stage != stage || s.UserID == "" {
		return domain.User{}, domain.ErrAuthenticationRequired
	}
	return domain.User{ID: s.UserID}, nil
}
func TestSCSStagesRotationAndCookies(t *testing.T) {
	store := memstore.New()
	defer store.StopCleanup()
	v := &validator{version: 1}
	config := session.Config{Lifetime: time.Hour, IdleTimeout: 10 * time.Minute, PendingLifetime: 5 * time.Minute}
	s, err := session.New(store, v, config)
	if err != nil {
		t.Fatal(err)
	}
	ctx, err := s.Manager.Load(t.Context(), "")
	if err != nil {
		t.Fatal(err)
	}
	pending := domain.Session{UserID: "fixture-user", Version: 1, Stage: domain.TOTPRequired}
	if err := s.Replace(ctx, pending); err != nil {
		t.Fatal(err)
	}
	if remaining := time.Until(s.Manager.Deadline(ctx)); remaining > config.PendingLifetime || remaining < config.PendingLifetime-time.Second { t.Fatal("pending lifetime not applied") }
	pendingToken, _, err := s.Manager.Commit(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := s.Current(ctx, domain.Authenticated); !errors.Is(err, domain.ErrAuthenticationRequired) {
		t.Fatal("pending grants access")
	}
	ctx, err = s.Manager.Load(t.Context(), pendingToken)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := s.Current(ctx, domain.TOTPRequired); err != nil {
		t.Fatal(err)
	}
	full := pending
	full.Stage = domain.Authenticated
	if err := s.Replace(ctx, full); err != nil {
		t.Fatal(err)
	}
	token, expiry, err := s.Manager.Commit(ctx)
	if err != nil || token == pendingToken {
		t.Fatal("token was not rotated")
	}
	old, err := s.Manager.Load(t.Context(), pendingToken)
	if err != nil || s.State(old).UserID != "" { t.Fatal("old token still valid") }
	loaded, err := s.Manager.Load(t.Context(), token)
	if err != nil { t.Fatal(err) }
	if _, err := s.Current(loaded, domain.Authenticated); err != nil { t.Fatal("new token unusable") }
	w := httptest.NewRecorder()
	s.Manager.WriteSessionCookie(ctx, w, token, expiry)
	cookie := w.Result().Cookies()[0]
	if cookie.Name != "__Host-session" || cookie.Path != "/" || cookie.Domain != "" || !cookie.Secure || !cookie.HttpOnly || cookie.SameSite != http.SameSiteLaxMode {
		t.Fatal("insecure cookie")
	}
	v.version++
	if _, err := s.Current(ctx, domain.Authenticated); !errors.Is(err, domain.ErrAuthenticationRequired) {
		t.Fatal("revoked session accepted")
	}
	if err := s.Destroy(ctx); err != nil {
		t.Fatal(err)
	}
	loggedOut, err := s.Manager.Load(t.Context(), token)
	if err != nil || s.State(loggedOut).UserID != "" { t.Fatal("logout did not delete session") }
	if err := s.Destroy(ctx); err != nil {
		t.Fatal("logout not idempotent")
	}
}
func TestSessionPolicyAndNoSecretError(t *testing.T) {
	store := memstore.New()
	defer store.StopCleanup()
	v := &validator{version: 1}
	for _, cfg := range []session.Config{{}, {Lifetime: time.Minute, IdleTimeout: time.Hour, PendingLifetime: time.Second}, {Lifetime: time.Hour, IdleTimeout: time.Minute, PendingLifetime: 2 * time.Hour}} {
		if _, err := session.New(store, v, cfg); err == nil {
			t.Fatal("invalid policy accepted")
		}
	}
	s, err := session.New(store, v, session.Config{Lifetime: time.Hour, IdleTimeout: time.Minute, PendingLifetime: time.Second})
	if err != nil {
		t.Fatal(err)
	}
	w := httptest.NewRecorder()
	s.Manager.ErrorFunc(w, httptest.NewRequest("GET", "/", nil), errors.New("fixture secret"))
	if w.Code != 500 || strings.Contains(w.Body.String(), "fixture secret") {
		t.Fatal("session error leaks detail")
	}
}
