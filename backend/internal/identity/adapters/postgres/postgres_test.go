package postgres_test

import (
	"context"
	"database/sql"
	"errors"
	"reflect"
	"sync"
	"testing"
	"time"

	"github.com/freedomCruz/monte-luna/backend/internal/identity/adapters/cryptography"
	"github.com/freedomCruz/monte-luna/backend/internal/identity/adapters/postgres"
	"github.com/freedomCruz/monte-luna/backend/internal/identity/domain"
	"github.com/jackc/pgx/v5/pgxpool"
	_ "github.com/jackc/pgx/v5/stdlib"
	"github.com/testcontainers/testcontainers-go"
	pgcontainer "github.com/testcontainers/testcontainers-go/modules/postgres"
)

func TestIdentityPersistence(t *testing.T) {
	ctx, cancel := context.WithTimeout(t.Context(), 2*time.Minute)
	defer cancel()
	container, err := pgcontainer.Run(ctx, "postgres:18.6-bookworm@sha256:afc7e2d441324c0388fa80c3d24f733b4194a4eb7f47dd8ee2b08eb1a24a647c", pgcontainer.WithDatabase("identity_test"), pgcontainer.WithUsername("identity_test"), pgcontainer.WithPassword("identity_test"), pgcontainer.BasicWaitStrategies())
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
	pool, err := pgxpool.New(ctx, url)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()
	repo := postgres.NewRepository(pool)
	hash, err := cryptography.NewHasher(nil).Hash("isolated fixture password")
	if err != nil {
		t.Fatal(err)
	}
	fresh := func(t *testing.T) {
		t.Helper()
		if err := postgres.Migrate(t.Context(), db); err != nil {
			t.Fatal(err)
		}
		if err := postgres.Down(t.Context(), db); err != nil {
			t.Fatal(err)
		}
		if err := postgres.Migrate(t.Context(), db); err != nil {
			t.Fatal(err)
		}
	}
	create := func(t *testing.T, email string, role domain.Role) domain.User {
		t.Helper()
		user, err := domain.NewUser(email, "Admin", role, domain.Active)
		if err != nil {
			t.Fatal(err)
		}
		user.PasswordHash = hash
		user, err = repo.Create(t.Context(), user)
		if err != nil {
			t.Fatal(err)
		}
		return user
	}
	list := func(t *testing.T) []domain.User {
		t.Helper()
		users, err := repo.List(t.Context(), "", 100)
		if err != nil {
			t.Fatal(err)
		}
		return users
	}
	t.Run("migration round trip and schema", func(t *testing.T) {
		fresh(t)
		if err := postgres.Migrate(t.Context(), db); err != nil {
			t.Fatal(err)
		}
		if len(list(t)) != 0 {
			t.Fatal("migration seeded administrators")
		}
		for _, table := range []string{"admin_users", "admin_totp_credentials", "admin_recovery_codes", "password_reset_tokens", "sessions", "security_events", "outbox", "processed_events", "goose_db_version"} {
			var present bool
			if err := db.QueryRowContext(t.Context(), `SELECT to_regclass($1) IS NOT NULL`, "identity."+table).Scan(&present); err != nil || !present {
				t.Fatalf("missing %s: %v", table, err)
			}
		}
		owner := create(t, "owner@example.test", domain.Owner)
		var version int
		if err := db.QueryRowContext(t.Context(), `SELECT uuid_extract_version(id)::integer FROM identity.admin_users WHERE id=$1`, owner.ID).Scan(&version); err != nil || version != 7 {
			t.Fatalf("UUID version=%d err=%v", version, err)
		}
		for _, tc := range []struct{ name, query string }{
			{"uppercase email", `UPDATE identity.admin_users SET email='UPPER@example.test' WHERE id=$1`},
			{"invalid role", `UPDATE identity.admin_users SET role='root' WHERE id=$1`},
			{"invalid status", `UPDATE identity.admin_users SET status='deleted' WHERE id=$1`},
			{"negative failures", `UPDATE identity.admin_users SET failed_login_attempts=-1 WHERE id=$1`},
			{"invalid session version", `UPDATE identity.admin_users SET session_version=0 WHERE id=$1`},
			{"invalid version", `UPDATE identity.admin_users SET version=0 WHERE id=$1`},
		} {
			t.Run(tc.name, func(t *testing.T) {
				before := list(t)
				if _, err := db.ExecContext(t.Context(), tc.query, owner.ID); err == nil {
					t.Fatal("invalid value accepted")
				}
				if !reflect.DeepEqual(list(t), before) {
					t.Fatal("rejection changed stored users")
				}
			})
		}
		var auditID string
		if err := db.QueryRowContext(t.Context(), `INSERT INTO identity.security_events(event_type) VALUES('login_failed') RETURNING id`).Scan(&auditID); err != nil {
			t.Fatal(err)
		}
		if _, err := db.ExecContext(t.Context(), `UPDATE identity.security_events SET metadata='{"changed":true}' WHERE id=$1`, auditID); err == nil {
			t.Fatal("audit record mutable")
		}
	})
	t.Run("repository validation and conflicts", func(t *testing.T) {
		fresh(t)
		staff, _ := domain.NewUser("staff@example.test", "Staff", domain.Staff, domain.Active)
		staff.PasswordHash = hash
		if _, err := repo.Create(t.Context(), staff); !errors.Is(err, domain.ErrLastActiveOwner) {
			t.Fatalf("staff bootstrapped: %v", err)
		}
		owner := create(t, "OWNER@example.test", domain.Owner)
		got, err := repo.FindByEmail(t.Context(), "OWNER@example.test")
		if err != nil || got.ID != owner.ID || got.Email != "owner@example.test" {
			t.Fatal("normalized lookup failed")
		}
		if got.PasswordHash != hash || got.Version != 1 || got.SessionVersion != 1 {
			t.Fatal("credentials/version not preserved")
		}
		before := list(t)
		if _, err := repo.Create(t.Context(), owner); !errors.Is(err, domain.ErrEmailConflict) {
			t.Fatalf("duplicate accepted: %v", err)
		}
		bad := owner
		bad.Email = "bad-email"
		if _, err := repo.Create(t.Context(), bad); !errors.Is(err, domain.ErrValidation) {
			t.Fatalf("bad user accepted: %v", err)
		}
		bad = owner
		bad.Email = "valid@example.test"
		bad.PasswordHash = "plaintext"
		if _, err := repo.Create(t.Context(), bad); !errors.Is(err, domain.ErrValidation) {
			t.Fatalf("plaintext accepted: %v", err)
		}
		if _, err := repo.Update(t.Context(), owner.ID, 0, domain.UserChanges{Status: ptr(domain.Disabled)}); !errors.Is(err, domain.ErrVersionConflict) {
			t.Fatalf("stale accepted: %v", err)
		}
		if _, err := repo.Update(t.Context(), owner.ID, 1, domain.UserChanges{Status: ptr(domain.Disabled)}); !errors.Is(err, domain.ErrLastActiveOwner) {
			t.Fatalf("last owner disabled: %v", err)
		}
		if _, err := repo.Update(t.Context(), owner.ID, 1, domain.UserChanges{Role: ptr(domain.Staff)}); !errors.Is(err, domain.ErrLastActiveOwner) {
			t.Fatalf("last owner demoted: %v", err)
		}
		if !reflect.DeepEqual(before, list(t)) {
			t.Fatal("rejected write changed records/counters")
		}
		if _, err := repo.Get(t.Context(), "0199c4e2-7a1b-7c3d-9e0f-1a2b3c4d5e6f"); !errors.Is(err, domain.ErrNotFound) {
			t.Fatalf("missing user: %v", err)
		}
		newName := "Changed"
		got, err = repo.Update(t.Context(), owner.ID, 1, domain.UserChanges{DisplayName: &newName})
		if err != nil || got.DisplayName != newName || got.Version != 2 || got.SessionVersion != 1 {
			t.Fatalf("profile update %+v err=%v", got, err)
		}
		second := create(t, "second@example.test", domain.Owner)
		got, err = repo.Update(t.Context(), second.ID, 1, domain.UserChanges{Role: ptr(domain.Staff)})
		if err != nil || got.SessionVersion != 2 || got.Role != domain.Staff {
			t.Fatalf("role invalidation %+v err=%v", got, err)
		}
		got, err = repo.Update(t.Context(), second.ID, 2, domain.UserChanges{Status: ptr(domain.Disabled)})
		if err != nil || got.SessionVersion != 3 || got.Status != domain.Disabled {
			t.Fatalf("disable invalidation %+v err=%v", got, err)
		}
		page, err := repo.List(t.Context(), "", 1)
		if err != nil || len(page) != 1 {
			t.Fatal("first page")
		}
		next, err := repo.List(t.Context(), page[0].ID, 1)
		if err != nil || len(next) != 1 || next[0].ID <= page[0].ID {
			t.Fatal("cursor pagination")
		}
	})
	t.Run("concurrent last owner protection", func(t *testing.T) {
		fresh(t)
		owners := []domain.User{create(t, "one@example.test", domain.Owner), create(t, "two@example.test", domain.Owner)}
		start := make(chan struct{})
		outcomes := make(chan error, 2)
		var wg sync.WaitGroup
		for _, owner := range owners {
			wg.Go(func() {
				<-start
				_, err := repo.Update(t.Context(), owner.ID, 1, domain.UserChanges{Status: ptr(domain.Disabled)})
				outcomes <- err
			})
		}
		close(start)
		wg.Wait()
		close(outcomes)
		success, rejected := 0, 0
		for err := range outcomes {
			if err == nil {
				success++
			} else if errors.Is(err, domain.ErrLastActiveOwner) {
				rejected++
			} else {
				t.Fatal(err)
			}
		}
		if success != 1 || rejected != 1 {
			t.Fatalf("success=%d rejected=%d", success, rejected)
		}
		active := 0
		for _, u := range list(t) {
			if u.Role == domain.Owner && u.Status == domain.Active {
				active++
				if u.Version != 1 || u.SessionVersion != 1 {
					t.Fatal("rejected owner mutated")
				}
			} else if u.Version != 2 || u.SessionVersion != 2 {
				t.Fatal("disabled owner version incorrect")
			}
		}
		if active != 1 {
			t.Fatal("last owner lost")
		}
	})
}
func ptr[T any](v T) *T { return &v }
