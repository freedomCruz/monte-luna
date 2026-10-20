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
	"sync/atomic"
	"testing"
	"time"

	"github.com/freedomCruz/monte-luna/backend/internal/identity/adapters/cli"
	"github.com/freedomCruz/monte-luna/backend/internal/identity/adapters/cryptography"
	"github.com/freedomCruz/monte-luna/backend/internal/identity/adapters/postgres"
	"github.com/freedomCruz/monte-luna/backend/internal/identity/app"
	"github.com/freedomCruz/monte-luna/backend/internal/identity/domain"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/pquerna/otp/totp"
	"github.com/testcontainers/testcontainers-go"
	pgcontainer "github.com/testcontainers/testcontainers-go/modules/postgres"
)

type managementLimiter struct{}

func (managementLimiter) Allow(context.Context, string, string, time.Time) (time.Duration, error) {
	return 0, nil
}
func TestAdministratorManagement(t *testing.T) {
	ctx, cancel := context.WithTimeout(t.Context(), 2*time.Minute)
	defer cancel()
	container, err := pgcontainer.Run(ctx, "postgres:18.6-bookworm@sha256:afc7e2d441324c0388fa80c3d24f733b4194a4eb7f47dd8ee2b08eb1a24a647c", pgcontainer.WithDatabase("management_test"), pgcontainer.WithUsername("identity_test"), pgcontainer.WithPassword("identity_test"), pgcontainer.BasicWaitStrategies())
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
	dummy, err := hasher.Hash("fixture password")
	if err != nil {
		t.Fatal(err)
	}
	cipher, err := cryptography.NewCipher(make([]byte, 32), nil)
	if err != nil {
		t.Fatal(err)
	}
	factors, err := cryptography.NewFactors("Fixture", nil)
	if err != nil {
		t.Fatal(err)
	}
	now := time.Date(2027, 7, 15, 12, 0, 0, 0, time.UTC)
	clock := func() time.Time { return now }
	auth, err := app.NewAuth(repo, hasher, cipher, factors, managementLimiter{}, clock, app.AuthConfig{LockoutThreshold: 5, LockoutDuration: time.Minute, RecoveryCount: 4, RecoveryBytes: 32, DummyPasswordHash: dummy})
	if err != nil {
		t.Fatal(err)
	}
	generator := cryptography.NewResetTokens(nil)
	issuer, err := app.NewTokenIssuer(cipher, generator)
	if err != nil {
		t.Fatal(err)
	}
	service, err := app.NewManagement(repo, auth, hasher, issuer, app.ManagementConfig{Now: clock, PasswordPolicy: func(p string) error {
		if p == "" {
			return domain.ErrValidation
		}
		return nil
	}})
	if err != nil {
		t.Fatal(err)
	}
	owner, err := service.Bootstrap(ctx, "owner@example.test", "Owner", "fixture password")
	if err != nil {
		t.Fatal(err)
	}
	secret := "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ"
	encrypted, err := cipher.Seal([]byte(secret), "identity.totp:"+owner.ID)
	if err != nil {
		t.Fatal(err)
	}
	if err := repo.TransactAuth(ctx, domain.AuthLookup{ID: owner.ID}, func(s *domain.AuthState) error {
		s.TOTP = domain.TOTPCredential{SecretEncrypted: encrypted, ConfirmedAt: &now}
		return nil
	}); err != nil {
		t.Fatal(err)
	}
	session := domain.Session{UserID: owner.ID, Version: owner.SessionVersion, Stage: domain.Authenticated}
	audit := domain.AuditContext{IP: "127.0.0.1", UserAgent: "fixture-agent"}
	snapshot := func() []domain.User {
		users, err := repo.List(ctx, "", 100)
		if err != nil {
			t.Fatal(err)
		}
		return users
	}
	counts := func() [3]int64 {
		var c [3]int64
		for i, query := range []string{`SELECT count(*) FROM identity.password_reset_tokens`, `SELECT count(*) FROM identity.outbox`, `SELECT count(*) FROM identity.security_events`} {
			if err := pool.QueryRow(ctx, query).Scan(&c[i]); err != nil {
				t.Fatal(err)
			}
		}
		return c
	}
	t.Run("invitation interoperates with password reset", func(t *testing.T) {
		invited, err := service.Invite(ctx, session, " NEW@example.test ", "New", domain.Staff, audit)
		if err != nil {
			t.Fatal(err)
		}
		var payloadBytes []byte
		if err := pool.QueryRow(ctx, `SELECT payload FROM identity.outbox WHERE type='identity.admin_invited' AND payload->>'admin_user_id'=$1`, invited.User.ID).Scan(&payloadBytes); err != nil {
			t.Fatal(err)
		}
		var payload domain.PasswordTokenPayload
		if err := json.Unmarshal(payloadBytes, &payload); err != nil {
			t.Fatal(err)
		}
		ciphertext, err := base64.StdEncoding.Strict().DecodeString(payload.RawTokenEncrypted)
		if err != nil {
			t.Fatal(err)
		}
		raw, err := cipher.Open(ciphertext, domain.PasswordResetPurpose(invited.User.ID))
		if err != nil || len(raw) != 43 || strings.Contains(string(payloadBytes), string(raw)) {
			t.Fatal("invalid/unencrypted invitation token")
		}
		hash, err := generator.Hash(string(raw))
		if err != nil {
			t.Fatal(err)
		}
		email, err := repo.PasswordResetAccount(ctx, hash, now)
		if err != nil || email != "new@example.test" {
			t.Fatal("invitation incompatible with reset token repository")
		}
		if _, err := repo.PasswordResetAccount(ctx, hash, now.Add(domain.PasswordResetLifetime)); !errors.Is(err, domain.ErrInvalidResetToken) {
			t.Fatal("invitation expiry boundary bypassed")
		}
		resets, err := app.NewPasswordResets(repo, hasher, cipher, generator, managementLimiter{}, clock, func(string) error { return nil })
		if err != nil {
			t.Fatal(err)
		}
		if err := resets.Complete(ctx, string(raw), "chosen password", audit.IP); err != nil {
			t.Fatal(err)
		}
		next, err := auth.Login(ctx, email, "chosen password", audit.IP)
		if err != nil || next.Stage != domain.EnrollmentRequired {
			t.Fatal("invitation bypassed mandatory enrollment")
		}
		if err := resets.Complete(ctx, string(raw), "other password", audit.IP); !errors.Is(err, domain.ErrInvalidResetToken) {
			t.Fatal("invitation token reusable")
		}
		before, oldCounts := snapshot(), counts()
		if _, err := service.Invite(ctx, session, email, "Duplicate", domain.Staff, audit); !errors.Is(err, domain.ErrEmailConflict) {
			t.Fatal("duplicate invitation accepted")
		}
		if !reflect.DeepEqual(before, snapshot()) || oldCounts != counts() {
			t.Fatal("duplicate invitation mutated state")
		}
		if _, err := pool.Exec(ctx, `ALTER TABLE identity.outbox ADD CONSTRAINT fixture_reject_invite CHECK(type<>'identity.admin_invited') NOT VALID`); err != nil {
			t.Fatal(err)
		}
		if _, err := service.Invite(ctx, session, "rollback@example.test", "Rollback", domain.Staff, audit); err == nil {
			t.Fatal("outbox rejection ignored")
		}
		if !reflect.DeepEqual(before, snapshot()) || oldCounts != counts() {
			t.Fatal("outbox failure partially committed")
		}
		if _, err := pool.Exec(ctx, `ALTER TABLE identity.outbox DROP CONSTRAINT fixture_reject_invite`); err != nil {
			t.Fatal(err)
		}
	})
	t.Run("owner authorization audit and atomic proof reset", func(t *testing.T) {
		target, err := service.Invite(ctx, session, "target@example.test", "Target", domain.Staff, audit)
		if err != nil {
			t.Fatal(err)
		}
		if err := repo.TransactAuth(ctx, domain.AuthLookup{ID: target.User.ID}, func(s *domain.AuthState) error {
			s.TOTP = domain.TOTPCredential{SecretEncrypted: encrypted, ConfirmedAt: &now}
			s.RecoveryHashes = []string{domain.HashRecovery("fixture recovery")}
			return nil
		}); err != nil {
			t.Fatal(err)
		}
		proof, err := totp.GenerateCode(secret, now)
		if err != nil {
			t.Fatal(err)
		}
		before, _ := repo.ReadAuth(ctx, target.User.ID)
		countBefore := counts()
		if _, err := service.ResetTOTP(ctx, session, target.User.ID, 99, "fixture password", domain.Proof{TOTP: proof}, audit); !errors.Is(err, domain.ErrVersionConflict) {
			t.Fatal("stale reset accepted")
		}
		after, _ := repo.ReadAuth(ctx, target.User.ID)
		if !reflect.DeepEqual(before, after) || countBefore != counts() {
			t.Fatal("stale reset changed credentials/audit")
		}
		result, err := service.ResetTOTP(ctx, session, target.User.ID, target.User.Version, "fixture password", domain.Proof{TOTP: proof}, audit)
		if err != nil || result.User.SessionVersion != 2 {
			t.Fatal("TOTP reset failed")
		}
		state, err := repo.ReadAuth(ctx, target.User.ID)
		if err != nil || state.TOTP.ConfirmedAt != nil || len(state.TOTP.SecretEncrypted) != 0 || len(state.RecoveryHashes) != 0 {
			t.Fatal("reset retained credentials")
		}
		if _, err := auth.Validate(ctx, domain.Session{UserID: target.User.ID, Version: 1, Stage: domain.Authenticated}, domain.Authenticated); !errors.Is(err, domain.ErrAuthenticationRequired) {
			t.Fatal("target session survived reset")
		}
		if _, err := service.ResetTOTP(ctx, session, target.User.ID, result.User.Version, "fixture password", domain.Proof{TOTP: proof}, audit); !errors.Is(err, domain.ErrInvalidCredentials) {
			t.Fatal("owner proof reusable")
		}
		staff := domain.Session{UserID: target.User.ID, Version: 2, Stage: domain.Authenticated}
		if _, err := service.Get(ctx, staff, owner.ID); !errors.Is(err, domain.ErrAuthenticationRequired) {
			t.Fatal("unenrolled staff authorized")
		}
		users, err := service.List(ctx, session, "", 100)
		if err != nil || len(users) < 2 {
			t.Fatal("owner list failed")
		}
		var metadata []byte
		var ua string
		if err := pool.QueryRow(ctx, `SELECT metadata,user_agent FROM identity.security_events WHERE event_type='totp_reset' AND admin_user_id=$1 ORDER BY created_at DESC LIMIT 1`, owner.ID).Scan(&metadata, &ua); err != nil {
			t.Fatal(err)
		}
		if !strings.Contains(string(metadata), target.User.ID) || ua != "fixture-agent" || strings.Contains(string(metadata), proof) {
			t.Fatal("audit lost target/context or leaked proof")
		}
	})
	t.Run("invitation payload names the assigned role; reset payload does not", func(t *testing.T) {
		keys := func(eventType, id string) map[string]any {
			t.Helper()
			var payloadBytes []byte
			if err := pool.QueryRow(ctx, `SELECT payload FROM identity.outbox WHERE type=$1 AND payload->>'admin_user_id'=$2 ORDER BY occurred_at DESC, id DESC LIMIT 1`, eventType, id).Scan(&payloadBytes); err != nil {
				t.Fatal(err)
			}
			var payload map[string]any
			if err := json.Unmarshal(payloadBytes, &payload); err != nil {
				t.Fatal(err)
			}
			return payload
		}
		for _, tc := range []struct {
			email string
			role  domain.Role
		}{{"role-staff@example.test", domain.Staff}, {"role-owner@example.test", domain.Owner}} {
			invited, err := service.Invite(ctx, session, tc.email, "Role", tc.role, audit)
			if err != nil {
				t.Fatal(err)
			}
			payload := keys("identity.admin_invited", invited.User.ID)
			if len(payload) != 5 || payload["role"] != string(tc.role) || payload["email"] != tc.email || payload["display_name"] != "Role" || payload["raw_token_encrypted"] == "" {
				t.Fatalf("invitation payload %v", payload)
			}
			if tc.role == domain.Owner {
				// Later subtests rely on the original active-owner count.
				disabled := domain.Disabled
				if _, err := service.Update(ctx, session, invited.User.ID, invited.User.Version, domain.UserChanges{Status: &disabled}, audit); err != nil {
					t.Fatal(err)
				}
			}
		}
		resets, err := app.NewPasswordResets(repo, hasher, cipher, generator, managementLimiter{}, clock, func(string) error { return nil })
		if err != nil {
			t.Fatal(err)
		}
		if err := resets.Request(ctx, "role-staff@example.test", "127.0.0.1"); err != nil {
			t.Fatal(err)
		}
		staff, err := repo.FindByEmail(ctx, "role-staff@example.test")
		if err != nil {
			t.Fatal(err)
		}
		if payload := keys("identity.password_reset_requested", staff.ID); len(payload) != 4 || payload["role"] != nil {
			t.Fatalf("reset payload changed: %v", payload)
		}
	})
	t.Run("stdin-only emergency commands preserve MFA and revoke prior links", func(t *testing.T) {
		target, err := service.Invite(ctx, session, "recovery@example.test", "Recovery", domain.Staff, audit)
		if err != nil {
			t.Fatal(err)
		}
		encryptedTarget, err := cipher.Seal([]byte(secret), "identity.totp:"+target.User.ID)
		if err != nil {
			t.Fatal(err)
		}
		if err := repo.TransactAuth(ctx, domain.AuthLookup{ID: target.User.ID}, func(s *domain.AuthState) error {
			s.TOTP = domain.TOTPCredential{SecretEncrypted: encryptedTarget, ConfirmedAt: &now}
			s.RecoveryHashes = []string{domain.HashRecovery("fixture recovery")}
			return nil
		}); err != nil {
			t.Fatal(err)
		}
		var payloadBytes []byte
		if err := pool.QueryRow(ctx, `SELECT payload FROM identity.outbox WHERE type='identity.admin_invited' AND payload->>'admin_user_id'=$1`, target.User.ID).Scan(&payloadBytes); err != nil {
			t.Fatal(err)
		}
		var payload domain.PasswordTokenPayload
		if err := json.Unmarshal(payloadBytes, &payload); err != nil {
			t.Fatal(err)
		}
		ciphertext, err := base64.StdEncoding.Strict().DecodeString(payload.RawTokenEncrypted)
		if err != nil {
			t.Fatal(err)
		}
		raw, err := cipher.Open(ciphertext, domain.PasswordResetPurpose(target.User.ID))
		if err != nil {
			t.Fatal(err)
		}
		hash, err := generator.Hash(string(raw))
		if err != nil {
			t.Fatal(err)
		}
		runner, err := cli.New(service, cli.Config{MaxPasswordBytes: 64})
		if err != nil {
			t.Fatal(err)
		}
		var stdout, stderr bytes.Buffer
		if code := runner.Run(ctx, []string{"reset-password", "--email", target.User.Email}, strings.NewReader("new fixture password\n"), &stdout, &stderr); code != 0 || stdout.String() != "Administrator command completed.\n" || stderr.Len() != 0 {
			t.Fatal("emergency CLI password command failed")
		}
		if _, err := repo.PasswordResetAccount(ctx, hash, now); !errors.Is(err, domain.ErrInvalidResetToken) {
			t.Fatal("outstanding invitation survived emergency password change")
		}
		pending, err := auth.Login(ctx, target.User.Email, "new fixture password", audit.IP)
		if err != nil || pending.Stage != domain.TOTPRequired || pending.Version != 2 {
			t.Fatal("password command bypassed MFA or failed session revocation")
		}
		state, err := repo.ReadAuth(ctx, target.User.ID)
		if err != nil || state.TOTP.ConfirmedAt == nil || len(state.RecoveryHashes) != 1 {
			t.Fatal("password command modified MFA")
		}
		stdout.Reset()
		stderr.Reset()
		if code := runner.Run(ctx, []string{"reset-totp", "--email", target.User.Email}, nil, &stdout, &stderr); code != 0 || stdout.String() != "Administrator command completed.\n" || stderr.Len() != 0 {
			t.Fatal("emergency CLI TOTP command failed")
		}
		pending, err = auth.Login(ctx, target.User.Email, "new fixture password", audit.IP)
		if err != nil || pending.Stage != domain.EnrollmentRequired || pending.Version != 3 {
			t.Fatal("emergency TOTP command failed enrollment/revocation")
		}
		state, err = repo.ReadAuth(ctx, target.User.ID)
		if err != nil || len(state.RecoveryHashes) != 0 || len(state.TOTP.SecretEncrypted) != 0 {
			t.Fatal("emergency TOTP reset retained proofs")
		}
		var audits int
		if err := pool.QueryRow(ctx, `SELECT count(*) FROM identity.security_events WHERE metadata->>'source'='cli' AND metadata->>'outcome'='succeeded' AND metadata->>'target_id'=$1`, target.User.ID).Scan(&audits); err != nil || audits != 2 {
			t.Fatal("CLI commands missing audit records")
		}
	})
	t.Run("concurrent owner changes preserve last owner", func(t *testing.T) {
		other, err := service.Invite(ctx, session, "other-owner@example.test", "Other", domain.Owner, audit)
		if err != nil {
			t.Fatal(err)
		}
		staff := domain.Staff
		var successes atomic.Int32
		var wg sync.WaitGroup
		for _, id := range []string{owner.ID, other.User.ID} {
			wg.Go(func() {
				_, err := service.Update(ctx, session, id, 1, domain.UserChanges{Role: &staff}, audit)
				if err == nil {
					successes.Add(1)
				} else if !errors.Is(err, domain.ErrLastActiveOwner) && !errors.Is(err, domain.ErrAuthenticationRequired) && !errors.Is(err, domain.ErrForbidden) {
					t.Error(err)
				}
			})
		}
		wg.Wait()
		if successes.Load() != 1 {
			t.Fatal("concurrent management did not preserve owner invariant")
		}
		active := 0
		for _, u := range snapshot() {
			if u.Role == domain.Owner && u.Status == domain.Active {
				active++
			}
		}
		if active != 1 {
			t.Fatal("last owner lost")
		}
	})
	t.Run("bounded one year retention", func(t *testing.T) {
		// A future reference avoids interacting with existing fixture events.
		reference := time.Date(2035, 6, 1, 0, 0, 0, 0, time.UTC)
		boundary := reference.AddDate(-1, 0, 0)
		if err := repo.Manage(ctx, func(tx domain.AdminTx) error {
			for _, at := range []time.Time{boundary.Add(-time.Microsecond), boundary, reference} {
				if err := tx.Audit(ctx, domain.SecurityEvent{Type: "login_failed", CreatedAt: at, Metadata: domain.EventMetadata{Source: "cli", Outcome: "failed"}}); err != nil {
					return err
				}
			}
			return nil
		}); err != nil {
			t.Fatal(err)
		}
		if _, err := repo.DeleteOldSecurityEvents(ctx, reference, 0); !errors.Is(err, domain.ErrValidation) {
			t.Fatal("invalid cleanup batch accepted")
		}
		// Each call deletes at most one row, including pre-existing older events.
		for {
			n, err := repo.DeleteOldSecurityEvents(ctx, reference, 1)
			if err != nil || n > 1 {
				t.Fatal("unbounded cleanup")
			}
			if n == 0 {
				break
			}
		}
		var retained int
		if err := pool.QueryRow(ctx, `SELECT count(*) FROM identity.security_events`).Scan(&retained); err != nil || retained != 2 {
			t.Fatal("retention removed boundary/recent events")
		}
	})
}
