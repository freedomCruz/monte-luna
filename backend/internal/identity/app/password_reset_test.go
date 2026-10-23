package app_test

import (
	"bytes"
	"context"
	"encoding/base64"
	"errors"
	"reflect"
	"strings"
	"testing"
	"time"

	"github.com/freedomCruz/monte-luna/backend/internal/identity/adapters/cryptography"
	"github.com/freedomCruz/monte-luna/backend/internal/identity/app"
	"github.com/freedomCruz/monte-luna/backend/internal/identity/domain"
)

type resetRepo struct {
	user   domain.User
	issue  domain.PasswordResetIssue
	expiry time.Time
	used   bool
	events int
	fail   bool
}

func (r *resetRepo) IssuePasswordReset(_ context.Context, email string, now time.Time, makeIssue func(domain.User) (domain.PasswordResetIssue, error)) error {
	if email != r.user.Email || r.user.Status != domain.Active {
		return nil
	}
	issue, err := makeIssue(r.user)
	if err != nil {
		return err
	}
	if r.fail {
		return errors.New("private dependency detail")
	}
	r.issue = issue
	r.expiry = now.Add(30 * time.Minute)
	r.used = false
	r.events++
	return nil
}
func (r *resetRepo) PasswordResetAccount(_ context.Context, hash string, now time.Time) (string, error) {
	if hash != r.issue.TokenHash || r.used || !now.Before(r.expiry) || r.user.Status != domain.Active {
		return "", domain.ErrInvalidResetToken
	}
	return r.user.Email, nil
}
func (r *resetRepo) CompletePasswordReset(ctx context.Context, hash, password string, now time.Time, _ string) error {
	if _, err := r.PasswordResetAccount(ctx, hash, now); err != nil {
		return err
	}
	r.used = true
	r.user.PasswordHash = password
	r.user.SessionVersion++
	r.user.PasswordChangedAt = now
	return nil
}

type resetLimiter struct {
	delay    time.Duration
	accounts []string
}

func (l *resetLimiter) Allow(_ context.Context, account, _ string, _ time.Time) (time.Duration, error) {
	l.accounts = append(l.accounts, account)
	return l.delay, nil
}

type resetBadTokens struct{}

func (resetBadTokens) Generate() (string, string, error) {
	return "", "", errors.New("raw-secret-in-injected-error")
}
func (resetBadTokens) Hash(string) (string, error) {
	return "", errors.New("raw-secret-in-injected-error")
}

func TestPasswordResetUseCases(t *testing.T) {
	now := time.Date(2026, 10, 20, 18, 0, 0, 0, time.UTC)
	repo := &resetRepo{user: domain.User{ID: "0199c4e2-7a1b-7c3d-9e0f-1a2b3c4d5e6f", Email: "owner@example.test", DisplayName: "Owner", Status: domain.Active, SessionVersion: 7}}
	if domain.PasswordResetPurpose(repo.user.ID) != "identity.password-token:"+repo.user.ID {
		t.Fatal("invitation and reset consumers must share the canonical AAD")
	}
	cipher, err := cryptography.NewCipher(bytes.Repeat([]byte{4}, 32), nil)
	if err != nil {
		t.Fatal(err)
	}
	limiter := &resetLimiter{}
	tokens := cryptography.NewResetTokens(nil)
	service, err := app.NewPasswordResets(repo, cryptography.NewHasher(nil), cipher, tokens, limiter, func() time.Time { return now }, allowPasswords)
	if err != nil {
		t.Fatal(err)
	}
	rawToken := func() string {
		t.Helper()
		encoded, err := base64.StdEncoding.DecodeString(repo.issue.RawTokenEncrypted)
		if err != nil {
			t.Fatal("invalid encrypted payload encoding")
		}
		raw, err := cipher.Open(encoded, domain.PasswordResetPurpose(repo.user.ID))
		if err != nil {
			t.Fatal("unable to decrypt fixture event")
		}
		return string(raw)
	}
	t.Run("uniform request and encrypted event", func(t *testing.T) {
		for _, email := range []string{"OWNER@example.test", "missing@example.test"} {
			if err := service.Request(t.Context(), email, "127.0.0.1"); err != nil {
				t.Fatalf("request not uniform: %v", err)
			}
		}
		if repo.events != 1 || repo.expiry.Sub(now) != 30*time.Minute {
			t.Fatal("wrong event count or lifetime")
		}
		raw := rawToken()
		hash, err := tokens.Hash(raw)
		if err != nil || hash != repo.issue.TokenHash || strings.Contains(repo.issue.RawTokenEncrypted, raw) {
			t.Fatal("raw token persisted or hash mismatch")
		}
		before := repo.issue
		repo.user.Status = domain.Disabled
		if err := service.Request(t.Context(), repo.user.Email, "127.0.0.1"); err != nil || !reflect.DeepEqual(before, repo.issue) || repo.events != 1 {
			t.Fatal("disabled account response or state differs")
		}
		repo.user.Status = domain.Active
	})
	t.Run("superseded expired and single use", func(t *testing.T) {
		previous := rawToken()
		if err := service.Request(t.Context(), repo.user.Email, "127.0.0.1"); err != nil {
			t.Fatal(err)
		}
		current := rawToken()
		if current == previous {
			t.Fatal("token reused")
		}
		before := *repo
		if err := service.Complete(t.Context(), previous, "new password", "127.0.0.1"); !errors.Is(err, domain.ErrInvalidResetToken) || !reflect.DeepEqual(before, *repo) {
			t.Fatal("superseded token changed state")
		}
		now = repo.expiry
		if err := service.Complete(t.Context(), current, "new password", "127.0.0.1"); !errors.Is(err, domain.ErrInvalidResetToken) || !reflect.DeepEqual(before, *repo) {
			t.Fatal("expiry boundary accepted or mutated state")
		}
		now = now.Add(-time.Second)
		if err := service.Complete(t.Context(), current, "rejected", "127.0.0.1"); !errors.Is(err, domain.ErrValidation) || !reflect.DeepEqual(before, *repo) {
			t.Fatal("password policy rejection consumed the token or changed state")
		}
		if err := service.Complete(t.Context(), current, "new password", "127.0.0.1"); err != nil {
			t.Fatal(err)
		}
		ok, _, err := cryptography.NewHasher(nil).Verify("new password", repo.user.PasswordHash)
		if err != nil || !ok || repo.user.SessionVersion != 8 || !repo.user.PasswordChangedAt.Equal(now) {
			t.Fatal("password/session invalidation missing")
		}
		if limiter.accounts[len(limiter.accounts)-1] != repo.user.Email {
			t.Fatal("completion did not limit known account")
		}
		after := *repo
		if err := service.Complete(t.Context(), current, "second password", "127.0.0.1"); !errors.Is(err, domain.ErrInvalidResetToken) || !reflect.DeepEqual(after, *repo) {
			t.Fatal("consumed token accepted or mutated state")
		}
	})
	t.Run("rate limit and input rejection", func(t *testing.T) {
		before := *repo
		limiter.delay = time.Minute
		if err := service.Request(t.Context(), repo.user.Email, "127.0.0.1"); !errors.Is(err, domain.ErrRateLimited) {
			t.Fatal("request rate limit bypassed")
		}
		if err := service.Complete(t.Context(), "malformed", "new password", "127.0.0.1"); !errors.Is(err, domain.ErrRateLimited) {
			t.Fatal("invalid completion bypassed IP limit")
		}
		limiter.delay = 0
		if err := service.Complete(t.Context(), "malformed", "new password", "127.0.0.1"); !errors.Is(err, domain.ErrInvalidResetToken) {
			t.Fatal("malformed token accepted")
		}
		if err := service.Request(t.Context(), "bad email", "127.0.0.1"); !errors.Is(err, domain.ErrValidation) {
			t.Fatal("invalid email accepted")
		}
		if !reflect.DeepEqual(before, *repo) {
			t.Fatal("rejected input mutated persistent state")
		}
	})
	t.Run("dependency error redaction", func(t *testing.T) {
		bad, err := app.NewPasswordResets(repo, cryptography.NewHasher(nil), cipher, resetBadTokens{}, limiter, func() time.Time { return now }, allowPasswords)
		if err != nil {
			t.Fatal(err)
		}
		err = bad.Request(t.Context(), repo.user.Email, "127.0.0.1")
		if !errors.Is(err, domain.ErrResetUnavailable) || strings.Contains(err.Error(), "raw-secret") {
			t.Fatal("private dependency details escaped")
		}
	})
}

func TestResetTokenEntropy(t *testing.T) {
	tokens := cryptography.NewResetTokens(nil)
	raw, hash, err := tokens.Generate()
	if err != nil || len(raw) != 43 || len(hash) != 64 {
		t.Fatal("wrong reset entropy/encoding")
	}
	decoded, err := base64.RawURLEncoding.DecodeString(raw)
	if err != nil || len(decoded) != 32 {
		t.Fatal("token below 32 random bytes")
	}
	if got, err := tokens.Hash(raw); err != nil || got != hash {
		t.Fatal("token hash mismatch")
	}
	if _, _, err := cryptography.NewResetTokens(bytes.NewReader(nil)).Generate(); err == nil {
		t.Fatal("entropy failure ignored")
	}
}

func allowPasswords(password string) error {
	if password == "rejected" {
		return domain.ErrValidation
	}
	return nil
}
