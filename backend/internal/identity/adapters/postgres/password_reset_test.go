package postgres_test

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/base64"
	"encoding/json"
	"errors"
	"reflect"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/freedomCruz/monte-luna/backend/internal/identity/adapters/cryptography"
	"github.com/freedomCruz/monte-luna/backend/internal/identity/adapters/postgres"
	"github.com/freedomCruz/monte-luna/backend/internal/identity/app"
	"github.com/freedomCruz/monte-luna/backend/internal/identity/domain"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/testcontainers/testcontainers-go"
	pgcontainer "github.com/testcontainers/testcontainers-go/modules/postgres"
)

type resetTestLimiter struct{}

func (resetTestLimiter) Allow(context.Context, string, string, time.Time) (time.Duration, error) {
	return 0, nil
}

func TestPasswordResetPersistence(t *testing.T) {
	ctx, cancel := context.WithTimeout(t.Context(), 2*time.Minute)
	defer cancel()
	container, err := pgcontainer.Run(ctx, "postgres:18.6-bookworm@sha256:afc7e2d441324c0388fa80c3d24f733b4194a4eb7f47dd8ee2b08eb1a24a647c", pgcontainer.WithDatabase("identity_reset_test"), pgcontainer.WithUsername("identity_test"), pgcontainer.WithPassword("identity_test"), pgcontainer.BasicWaitStrategies())
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
	hasher := cryptography.NewHasher(nil)
	hash, err := hasher.Hash("fixture original password")
	if err != nil {
		t.Fatal(err)
	}
	user, _ := domain.NewUser("owner@example.test", "Owner", domain.Owner, domain.Active)
	user.PasswordHash = hash
	user, err = repo.Create(ctx, user)
	if err != nil {
		t.Fatal(err)
	}
	now := time.Date(2026, 10, 20, 19, 0, 0, 0, time.UTC)
	step := int64(100)
	if err := repo.TransactAuth(ctx, domain.AuthLookup{ID: user.ID}, func(s *domain.AuthState) error {
		confirmed := now.Add(-time.Hour)
		s.TOTP = domain.TOTPCredential{SecretEncrypted: []byte("encrypted fixture credential"), ConfirmedAt: &confirmed, LastUsedStep: &step}
		s.RecoveryHashes = []string{domain.HashRecovery("fixture recovery code")}
		s.User.FailedLoginAttempts = 2
		return nil
	}); err != nil {
		t.Fatal(err)
	}
	cipher, err := cryptography.NewCipher(bytes.Repeat([]byte{5}, 32), nil)
	if err != nil {
		t.Fatal(err)
	}
	service, err := app.NewPasswordResets(repo, hasher, cipher, cryptography.NewResetTokens(nil), resetTestLimiter{}, func() time.Time { return now }, allowPasswords)
	if err != nil {
		t.Fatal(err)
	}
	// The exported repository methods are exercised through the app; SQL reads
	// below inspect durable security/event boundaries, never hidden Go state.
	snapshot := func() string {
		t.Helper()
		var got string
		err := db.QueryRowContext(ctx, `SELECT jsonb_build_object(
   'users',(SELECT jsonb_agg(to_jsonb(u) ORDER BY id) FROM identity.admin_users u),
   'tokens',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM identity.password_reset_tokens t),
   'outbox',(SELECT jsonb_agg(to_jsonb(o) ORDER BY id) FROM identity.outbox o),
   'audit',(SELECT jsonb_agg(to_jsonb(a) ORDER BY id) FROM identity.security_events a),
   'totp',(SELECT jsonb_agg(to_jsonb(c) ORDER BY id) FROM identity.admin_totp_credentials c),
   'recovery',(SELECT jsonb_agg(to_jsonb(r) ORDER BY id) FROM identity.admin_recovery_codes r),
   'sessions',(SELECT jsonb_agg(to_jsonb(s) ORDER BY token) FROM identity.sessions s))::text`).Scan(&got)
		if err != nil {
			t.Fatal(err)
		}
		return got
	}
	request := func() string {
		t.Helper()
		if err := service.Request(ctx, user.Email, "127.0.0.1"); err != nil {
			t.Fatal(err)
		}
		var encoded []byte
		if err := db.QueryRowContext(ctx, `SELECT payload FROM identity.outbox WHERE type='identity.password_reset_requested' ORDER BY id DESC LIMIT 1`).Scan(&encoded); err != nil {
			t.Fatal(err)
		}
		var payload domain.PasswordTokenPayload
		if err := json.Unmarshal(encoded, &payload); err != nil {
			t.Fatal(err)
		}
		if payload.AdminUserID != user.ID || payload.Email != user.Email || payload.DisplayName != user.DisplayName {
			t.Fatal("event recipient mismatch")
		}
		encrypted, err := base64.StdEncoding.DecodeString(payload.RawTokenEncrypted)
		if err != nil {
			t.Fatal(err)
		}
		raw, err := cipher.Open(encrypted, domain.PasswordResetPurpose(user.ID))
		if err != nil {
			t.Fatal("token not encrypted for consumer")
		}
		if strings.Contains(snapshot(), string(raw)) {
			t.Fatal("raw token persisted in identity state")
		}
		var duration float64
		if err := db.QueryRowContext(ctx, `SELECT extract(epoch FROM expires_at-created_at)::double precision FROM identity.password_reset_tokens ORDER BY id DESC LIMIT 1`).Scan(&duration); err != nil || duration != 1800 {
			t.Fatal("token validity not exactly 30 minutes")
		}
		return string(raw)
	}
	first := request()
	before := snapshot()
	if err := service.Request(ctx, "missing@example.test", "127.0.0.1"); err != nil || snapshot() != before {
		t.Fatal("unknown request differs or writes state")
	}
	second := request()
	before = snapshot()
	if err := service.Complete(ctx, first, "replacement password", "127.0.0.1"); !errors.Is(err, domain.ErrInvalidResetToken) || snapshot() != before {
		t.Fatal("superseded token accepted or mutated state")
	}
	now = now.Add(domain.PasswordResetLifetime)
	if err := service.Complete(ctx, second, "replacement password", "127.0.0.1"); !errors.Is(err, domain.ErrInvalidResetToken) || snapshot() != before {
		t.Fatal("expired token accepted or mutated state")
	}
	now = now.Add(-domain.PasswordResetLifetime)
	// Force outbox insertion to fail after the supersession/token INSERT steps.
	if _, err := db.ExecContext(ctx, `CREATE FUNCTION identity.fail_reset_event() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fixture outbox unavailable'; END $$;
 CREATE TRIGGER fail_reset_event BEFORE INSERT ON identity.outbox FOR EACH ROW EXECUTE FUNCTION identity.fail_reset_event()`); err != nil {
		t.Fatal(err)
	}
	if err := service.Request(ctx, user.Email, "127.0.0.1"); !errors.Is(err, domain.ErrResetUnavailable) || snapshot() != before {
		t.Fatal("outbox failure partially committed")
	}
	if _, err := db.ExecContext(ctx, `DROP TRIGGER fail_reset_event ON identity.outbox; DROP FUNCTION identity.fail_reset_event()`); err != nil {
		t.Fatal(err)
	}
	// Force the final audit write to fail, proving token consumption and password
	// replacement roll back together as well.
	if _, err := db.ExecContext(ctx, `CREATE FUNCTION identity.fail_reset_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.event_type='password_reset_completed' THEN RAISE EXCEPTION 'fixture audit unavailable'; END IF; RETURN NEW; END $$;
 CREATE TRIGGER fail_reset_audit BEFORE INSERT ON identity.security_events FOR EACH ROW EXECUTE FUNCTION identity.fail_reset_audit()`); err != nil {
		t.Fatal(err)
	}
	if err := service.Complete(ctx, second, "replacement password", "127.0.0.1"); !errors.Is(err, domain.ErrResetUnavailable) || snapshot() != before {
		t.Fatal("completion audit failure partially committed")
	}
	if _, err := db.ExecContext(ctx, `DROP TRIGGER fail_reset_audit ON identity.security_events; DROP FUNCTION identity.fail_reset_audit()`); err != nil {
		t.Fatal(err)
	}
	authBefore, err := repo.ReadAuth(ctx, user.ID)
	if err != nil {
		t.Fatal(err)
	}
	var wg sync.WaitGroup
	outcomes := make(chan error, 4)
	start := make(chan struct{})
	for range 4 {
		wg.Go(func() { <-start; outcomes <- service.Complete(ctx, second, "replacement password", "127.0.0.1") })
	}
	close(start)
	wg.Wait()
	close(outcomes)
	successes, rejections := 0, 0
	for err := range outcomes {
		if err == nil {
			successes++
		} else if errors.Is(err, domain.ErrInvalidResetToken) {
			rejections++
		} else {
			t.Fatal(err)
		}
	}
	if successes != 1 || rejections != 3 {
		t.Fatalf("completions=%d rejected=%d", successes, rejections)
	}
	authAfter, err := repo.ReadAuth(ctx, user.ID)
	if err != nil {
		t.Fatal(err)
	}
	ok, _, err := hasher.Verify("replacement password", authAfter.User.PasswordHash)
	if err != nil || !ok || authAfter.User.SessionVersion != authBefore.User.SessionVersion+1 || !authAfter.User.PasswordChangedAt.Equal(now) {
		t.Fatal("password/session change missing")
	}
	if !reflect.DeepEqual(authBefore.TOTP, authAfter.TOTP) || !reflect.DeepEqual(authBefore.RecoveryHashes, authAfter.RecoveryHashes) || authBefore.User.FailedLoginAttempts != authAfter.User.FailedLoginAttempts {
		t.Fatal("reset bypassed 2FA or changed unrelated counters")
	}
	before = snapshot()
	if err := service.Complete(ctx, second, "another password", "127.0.0.1"); !errors.Is(err, domain.ErrInvalidResetToken) || snapshot() != before {
		t.Fatal("reused token changed persistent state")
	}
	var sessions, events int
	if err := db.QueryRowContext(ctx, `SELECT (SELECT count(*) FROM identity.sessions),(SELECT count(*) FROM identity.security_events WHERE event_type='password_reset_completed')`).Scan(&sessions, &events); err != nil || sessions != 0 || events != 1 {
		t.Fatal("reset created a session or duplicated completion audit")
	}
}

func allowPasswords(string) error { return nil }
