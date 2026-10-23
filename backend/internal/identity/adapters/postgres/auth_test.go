package postgres_test

import (
	"context"
	"database/sql"
	"errors"
	"reflect"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/freedomCruz/monte-luna/backend/internal/identity/adapters/cryptography"
	"github.com/freedomCruz/monte-luna/backend/internal/identity/adapters/postgres"
	"github.com/freedomCruz/monte-luna/backend/internal/identity/domain"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/testcontainers/testcontainers-go"
	pgcontainer "github.com/testcontainers/testcontainers-go/modules/postgres"
)

func TestAuthenticationPersistence(t *testing.T) {
	ctx, cancel := context.WithTimeout(t.Context(), 2*time.Minute)
	defer cancel()
	container, err := pgcontainer.Run(ctx, "postgres:18.6-bookworm@sha256:afc7e2d441324c0388fa80c3d24f733b4194a4eb7f47dd8ee2b08eb1a24a647c", pgcontainer.WithDatabase("identity_auth_test"), pgcontainer.WithUsername("identity_test"), pgcontainer.WithPassword("identity_test"), pgcontainer.BasicWaitStrategies())
	if err != nil {
		t.Fatal(err)
	}
	testcontainers.CleanupContainer(t, container)
	url, err := container.ConnectionString(ctx, "sslmode=disable")
	if err != nil {
		t.Fatal(err)
	}
	db, err := sql.Open("pgx", url)
	if err != nil {
		t.Fatal(err)
	}
	defer func() {
		if err := db.Close(); err != nil {
			t.Error(err)
		}
	}()
	if err := postgres.Migrate(ctx, db); err != nil {
		t.Fatal(err)
	}
	pool, err := pgxpool.New(ctx, url)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()
	repo := postgres.NewRepository(pool)
	hash, err := cryptography.NewHasher(nil).Hash("fixture password")
	if err != nil {
		t.Fatal(err)
	}
	user, _ := domain.NewUser("owner@example.test", "Owner", domain.Owner, domain.Active)
	user.PasswordHash = hash
	user, err = repo.Create(ctx, user)
	if err != nil {
		t.Fatal(err)
	}
	t.Run("atomic credentials and rollback", func(t *testing.T) {
		until := time.Now().UTC().Add(time.Minute).Truncate(time.Microsecond)
		err := repo.TransactAuth(ctx, domain.AuthLookup{ID: user.ID}, func(s *domain.AuthState) error {
			s.User.FailedLoginAttempts = 3
			s.User.LockedUntil = &until
			s.TOTP = domain.TOTPCredential{SecretEncrypted: []byte("encrypted fixture")}
			s.RecoveryHashes = []string{domain.HashRecovery("fixture recovery")}
			s.Events = []domain.AuthEvent{{Type: "login_failed", IP: "127.0.0.1"}}
			return nil
		})
		if err != nil {
			t.Fatal(err)
		}
		before, err := repo.ReadAuth(ctx, user.ID)
		if err != nil {
			t.Fatal(err)
		}
		if before.User.FailedLoginAttempts != 3 || !before.User.LockedUntil.Equal(until) || len(before.RecoveryHashes) != 1 {
			t.Fatal("auth state lost")
		}
		rejected := errors.New("reject fixture")
		if err := repo.TransactAuth(ctx, domain.AuthLookup{ID: user.ID}, func(s *domain.AuthState) error {
			s.User.FailedLoginAttempts = 0
			s.RecoveryHashes = nil
			s.Events = []domain.AuthEvent{{Type: "login_succeeded"}}
			return rejected
		}); !errors.Is(err, rejected) {
			t.Fatal(err)
		}
		after, err := repo.ReadAuth(ctx, user.ID)
		if err != nil || !reflect.DeepEqual(before, after) {
			t.Fatal("rejection mutated state")
		}
		// A new repository instance sees the persisted lockout after a restart.
		restarted, err := postgres.NewRepository(pool).ReadAuth(ctx, user.ID)
		if err != nil || restarted.User.LockedUntil == nil {
			t.Fatal("restart lost lockout")
		}
	})
	t.Run("concurrent proof consumption", func(t *testing.T) {
		var successes atomic.Int32
		var wg sync.WaitGroup
		for range 8 {
			wg.Go(func() {
				err := repo.TransactAuth(ctx, domain.AuthLookup{ID: user.ID}, func(s *domain.AuthState) error {
					if len(s.RecoveryHashes) == 0 {
						return domain.ErrInvalidCredentials
					}
					s.RecoveryHashes = nil
					return nil
				})
				if err == nil {
					successes.Add(1)
				} else if !errors.Is(err, domain.ErrInvalidCredentials) {
					t.Error(err)
				}
			})
		}
		wg.Wait()
		if successes.Load() != 1 {
			t.Fatal("recovery consumed more than once")
		}
		successes.Store(0)
		for range 8 {
			wg.Go(func() {
				err := repo.TransactAuth(ctx, domain.AuthLookup{ID: user.ID}, func(s *domain.AuthState) error {
					if s.TOTP.LastUsedStep != nil {
						return domain.ErrInvalidCredentials
					}
					step := int64(123)
					s.TOTP.LastUsedStep = &step
					return nil
				})
				if err == nil {
					successes.Add(1)
				} else if !errors.Is(err, domain.ErrInvalidCredentials) {
					t.Error(err)
				}
			})
		}
		wg.Wait()
		if successes.Load() != 1 {
			t.Fatal("TOTP step consumed more than once")
		}
	})
	t.Run("schema qualified SCS store", func(t *testing.T) {
		store := postgres.NewSessionStore(pool)
		if _, found, err := store.FindCtx(ctx, "absent"); err != nil || found {
			t.Fatal("absent session found")
		}
		if err := store.CommitCtx(ctx, "fixture-token", []byte("session bytes"), time.Now().Add(time.Minute)); err != nil {
			t.Fatal(err)
		}
		data, found, err := store.FindCtx(ctx, "fixture-token")
		if err != nil || !found || string(data) != "session bytes" {
			t.Fatal("session missing")
		}
		if err := store.CommitCtx(ctx, "fixture-token", []byte("changed"), time.Now().Add(time.Minute)); err != nil {
			t.Fatal(err)
		}
		data, found, err = store.FindCtx(ctx, "fixture-token")
		if err != nil || !found || string(data) != "changed" {
			t.Fatal("session upsert failed")
		}
		if err := store.DeleteCtx(ctx, "fixture-token"); err != nil {
			t.Fatal(err)
		}
		if err := store.DeleteCtx(ctx, "fixture-token"); err != nil {
			t.Fatal("delete not idempotent")
		}
		if _, found, err := store.FindCtx(ctx, "fixture-token"); err != nil || found {
			t.Fatal("deleted session found")
		}
		if err := store.CommitCtx(ctx, "expired", []byte("expired"), time.Now().Add(-time.Minute)); err != nil {
			t.Fatal(err)
		}
		if _, found, err := store.FindCtx(ctx, "expired"); err != nil || found {
			t.Fatal("expired session accepted")
		}
		if n, err := store.DeleteExpired(ctx, 1); err != nil || n != 1 {
			t.Fatal("cleanup failed")
		}
		if err := repo.RecordAnonymousFailure(ctx, "127.0.0.1"); err != nil {
			t.Fatal(err)
		}
	})
}
