package app_test

import (
	"context"
	"errors"
	"reflect"
	"testing"
	"time"

	"github.com/freedomCruz/monte-luna/backend/internal/identity/app"
	"github.com/freedomCruz/monte-luna/backend/internal/identity/domain"
)

type memory struct{ state domain.AuthState }

func (m *memory) RecordAnonymousFailure(context.Context, string) error { return nil }

func (m *memory) ReadAuth(context.Context, string) (domain.AuthState, error) { return m.state, nil }
func (m *memory) TransactAuth(_ context.Context, lookup domain.AuthLookup, fn func(*domain.AuthState) error) error {
	if lookup.Email != "" && lookup.Email != m.state.User.Email {
		return domain.ErrNotFound
	}
	copy := m.state
	copy.RecoveryHashes = append([]string(nil), copy.RecoveryHashes...)
	copy.Events = nil
	if err := fn(&copy); err != nil {
		return err
	}
	m.state = copy
	return nil
}

type passwords struct{}

func (passwords) Verify(password, hash string) (bool, bool, error) {
	return password == "correct" && hash == "hash", false, nil
}
func (passwords) Hash(string) (string, error) { return "hash", nil }

type cipher struct{}

func (cipher) Seal(b []byte, _ string) ([]byte, error) {
	return append([]byte("encrypted:"), b...), nil
}
func (cipher) Open(b []byte, _ string) ([]byte, error) { return b[len("encrypted:"):], nil }

type factors struct{ n int }

func (f *factors) Generate(string) (string, string, error) {
	return "fixture-secret", "otpauth://fixture", nil
}
func (f *factors) Verify(secret, code string, now time.Time) (int64, bool) {
	return now.Unix() / 30, secret == "fixture-secret" && code == "123456"
}
func (f *factors) RecoveryCodes(count, _ int) ([]string, error) {
	f.n++
	out := make([]string, count)
	for i := range out {
		out[i] = string(rune('a'+i)) + string(rune('0'+f.n))
	}
	return out, nil
}

type limiter struct{ deny bool }

func (l *limiter) Allow(context.Context, string, string, time.Time) (time.Duration, error) {
	if l.deny {
		return time.Minute, nil
	}
	return 0, nil
}
func fixture(t *testing.T) (*app.Auth, *memory, *time.Time, *limiter) {
	t.Helper()
	now := time.Unix(1800000000, 0).UTC()
	m := &memory{state: domain.AuthState{User: domain.User{ID: "user", Email: "admin@example.test", Status: domain.Active, Role: domain.Owner, PasswordHash: "hash", SessionVersion: 1}}}
	l := &limiter{}
	a, err := app.NewAuth(m, passwords{}, cipher{}, &factors{}, l, func() time.Time { return now }, app.AuthConfig{LockoutThreshold: 3, LockoutDuration: time.Minute, RecoveryCount: 4, RecoveryBytes: 32, DummyPasswordHash: "hash"})
	if err != nil {
		t.Fatal(err)
	}
	return a, m, &now, l
}
func TestPasswordStageAndLockout(t *testing.T) {
	for _, tc := range []struct {
		name, email, password string
		disabled              bool
		want                  error
	}{
		{"unknown", "unknown@example.test", "correct", false, domain.ErrInvalidCredentials},
		{"wrong password", "admin@example.test", "wrong", false, domain.ErrInvalidCredentials},
		{"disabled", "admin@example.test", "correct", true, domain.ErrInvalidCredentials},
	} {
		t.Run(tc.name, func(t *testing.T) {
			a, m, _, _ := fixture(t)
			if tc.disabled {
				m.state.User.Status = domain.Disabled
			}
			_, err := a.Login(t.Context(), tc.email, tc.password, "127.0.0.1")
			if !errors.Is(err, tc.want) {
				t.Fatalf("wrong error: %v", err)
			}
		})
	}
	a, m, now, l := fixture(t)
	for range 3 {
		if _, err := a.Login(t.Context(), m.state.User.Email, "wrong", "127.0.0.1"); !errors.Is(err, domain.ErrInvalidCredentials) {
			t.Fatal(err)
		}
	}
	if m.state.User.FailedLoginAttempts != 3 || m.state.User.LockedUntil == nil {
		t.Fatal("lockout was not persisted")
	}
	if _, err := a.Login(t.Context(), m.state.User.Email, "correct", "127.0.0.1"); !errors.Is(err, domain.ErrRateLimited) {
		t.Fatal("lockout bypassed")
	}
	*now = now.Add(time.Minute)
	session, err := a.Login(t.Context(), " ADMIN@example.test ", "correct", "127.0.0.1")
	if err != nil || session.Stage != domain.EnrollmentRequired {
		t.Fatalf("stage=%s err=%v", session.Stage, err)
	}
	if m.state.User.FailedLoginAttempts != 0 || m.state.User.LockedUntil != nil {
		t.Fatal("successful password did not clear failures")
	}
	l.deny = true
	before := m.state
	if _, err := a.Login(t.Context(), m.state.User.Email, "correct", "127.0.0.1"); !errors.Is(err, domain.ErrRateLimited) {
		t.Fatal("limiter bypassed")
	}
	if !reflect.DeepEqual(before, m.state) {
		t.Fatal("rate rejection changed state")
	}
}
func TestEnrollmentReplayRecoveryAndRevocation(t *testing.T) {
	a, m, now, _ := fixture(t)
	pending, err := a.Login(t.Context(), m.state.User.Email, "correct", "127.0.0.1")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := a.Validate(t.Context(), pending, domain.Authenticated); !errors.Is(err, domain.ErrAuthenticationRequired) {
		t.Fatal("password grants full access")
	}
	enrollment, err := a.Enroll(t.Context(), pending, "127.0.0.1")
	if err != nil || enrollment.Secret != "fixture-secret" {
		t.Fatal("enroll failed")
	}
	if string(m.state.TOTP.SecretEncrypted) == enrollment.Secret {
		t.Fatal("plaintext TOTP persisted")
	}
	before := m.state
	if _, _, err := a.Confirm(t.Context(), pending, "000000", "127.0.0.1"); !errors.Is(err, domain.ErrInvalidCredentials) {
		t.Fatal("invalid code accepted")
	}
	if !reflect.DeepEqual(m.state.TOTP, before.TOTP) || len(m.state.RecoveryHashes) != 0 {
		t.Fatal("failed confirmation changed credentials")
	}
	full, codes, err := a.Confirm(t.Context(), pending, "123456", "127.0.0.1")
	if err != nil || full.Stage != domain.Authenticated || len(codes) != 4 {
		t.Fatal("confirmation failed")
	}
	if _, err := a.Enroll(t.Context(), pending, "127.0.0.1"); !errors.Is(err, domain.ErrTOTPEnrolled) {
		t.Fatal("confirmed TOTP overwritten")
	}
	login, err := a.Login(t.Context(), m.state.User.Email, "correct", "127.0.0.1")
	if err != nil || login.Stage != domain.TOTPRequired {
		t.Fatal("wrong stage")
	}
	if _, err := a.Verify(t.Context(), login, domain.Proof{TOTP: "123456"}, "127.0.0.1"); !errors.Is(err, domain.ErrInvalidCredentials) {
		t.Fatal("TOTP replay accepted")
	}
	*now = now.Add(30 * time.Second)
	if _, err := a.Verify(t.Context(), login, domain.Proof{TOTP: "123456"}, "127.0.0.1"); err != nil {
		t.Fatal(err)
	}
	if _, err := a.Verify(t.Context(), login, domain.Proof{RecoveryCode: codes[0]}, "127.0.0.1"); err != nil {
		t.Fatal(err)
	}
	if _, err := a.Verify(t.Context(), login, domain.Proof{RecoveryCode: codes[0]}, "127.0.0.1"); !errors.Is(err, domain.ErrInvalidCredentials) {
		t.Fatal("recovery replay accepted")
	}
	for _, hash := range m.state.RecoveryHashes {
		for _, code := range codes {
			if hash == code {
				t.Fatal("plaintext recovery persisted")
			}
		}
	}
	m.state.User.SessionVersion++
	for _, s := range []domain.Session{pending, login, full} {
		if _, err := a.Validate(t.Context(), s, s.Stage); !errors.Is(err, domain.ErrAuthenticationRequired) {
			t.Fatal("revoked session accepted")
		}
	}
}
func TestProofValidationAndRegeneration(t *testing.T) {
	a, m, now, _ := fixture(t)
	pending, _ := a.Login(t.Context(), m.state.User.Email, "correct", "127.0.0.1")
	_, _ = a.Enroll(t.Context(), pending, "127.0.0.1")
	full, old, err := a.Confirm(t.Context(), pending, "123456", "127.0.0.1")
	if err != nil {
		t.Fatal(err)
	}
	for _, p := range []domain.Proof{{}, {TOTP: "123456", RecoveryCode: old[0]}} {
		if _, err := a.Verify(t.Context(), domain.Session{UserID: "user", Version: 1, Stage: domain.TOTPRequired}, p, "127.0.0.1"); !errors.Is(err, domain.ErrValidation) {
			t.Fatal("ambiguous proof accepted")
		}
	}
	*now = now.Add(30 * time.Second)
	beforeHashes := append([]string(nil), m.state.RecoveryHashes...)
	if _, err := a.Regenerate(t.Context(), full, "wrong", domain.Proof{TOTP: "123456"}, "127.0.0.1"); !errors.Is(err, domain.ErrInvalidCredentials) {
		t.Fatal("wrong password accepted")
	}
	if !reflect.DeepEqual(beforeHashes, m.state.RecoveryHashes) {
		t.Fatal("failed reauthentication changed recovery set")
	}
	codes, err := a.Regenerate(t.Context(), full, "correct", domain.Proof{TOTP: "123456"}, "127.0.0.1")
	if err != nil || len(codes) != 4 {
		t.Fatal(err)
	}
	for _, hash := range m.state.RecoveryHashes {
		if hash == domain.HashRecovery(old[1]) {
			t.Fatal("old recovery retained")
		}
	}
	m.state.User.Status = domain.Disabled
	if _, err := a.Validate(t.Context(), full, domain.Authenticated); !errors.Is(err, domain.ErrAuthenticationRequired) {
		t.Fatal("disabled user accepted")
	}
}
func TestAuthConfigRequired(t *testing.T) {
	if _, err := app.NewAuth(&memory{}, passwords{}, cipher{}, &factors{}, &limiter{}, time.Now, app.AuthConfig{}); err == nil {
		t.Fatal("unapproved defaults accepted")
	}
}
