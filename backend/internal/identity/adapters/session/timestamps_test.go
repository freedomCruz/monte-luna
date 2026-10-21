package session_test

import (
	"errors"
	"testing"
	"time"

	"github.com/alexedwards/scs/v2/memstore"
	"github.com/freedomCruz/monte-luna/backend/internal/identity/adapters/session"
	"github.com/freedomCruz/monte-luna/backend/internal/identity/domain"
)

func TestSessionWithoutClockTimestampsIsRejected(t *testing.T) {
	store := memstore.New()
	defer store.StopCleanup()
	s, err := session.New(store, &validator{version: 1}, session.Config{Lifetime: time.Hour, IdleTimeout: 10 * time.Minute, PendingLifetime: 5 * time.Minute})
	if err != nil {
		t.Fatal(err)
	}
	ctx, err := s.Manager.Load(t.Context(), "")
	if err != nil {
		t.Fatal(err)
	}
	s.Manager.Put(ctx, "identity_user", "fixture-user")
	s.Manager.Put(ctx, "identity_version", int32(1))
	s.Manager.Put(ctx, "identity_stage", string(domain.Authenticated))
	if _, err := s.Current(ctx, domain.Authenticated); !errors.Is(err, domain.ErrAuthenticationRequired) {
		t.Fatal("session without issued/last-seen timestamps accepted")
	}
	if err := s.Replace(ctx, domain.Session{UserID: "fixture-user", Version: 1, Stage: domain.Authenticated}); err != nil {
		t.Fatal(err)
	}
	if _, err := s.Current(ctx, domain.Authenticated); err != nil {
		t.Fatal(err)
	}
}
