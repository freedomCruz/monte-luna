package app_test

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"reflect"
	"testing"
	"time"

	"github.com/freedomCruz/monte-luna/backend/internal/identity/adapters/cryptography"
	"github.com/freedomCruz/monte-luna/backend/internal/identity/app"
	"github.com/freedomCruz/monte-luna/backend/internal/identity/domain"
)

type adminMemory struct {
	users     map[string]domain.AuthState
	events    []domain.SecurityEvent
	tokens    []domain.PasswordToken
	outbox    []domain.TokenEvent
	failEvent bool
}

func (m *adminMemory) Manage(_ context.Context, fn func(domain.AdminTx) error) error {
	next := *m
	next.users = make(map[string]domain.AuthState)
	for id, s := range m.users {
		s.RecoveryHashes = append([]string(nil), s.RecoveryHashes...)
		next.users[id] = s
	}
	next.events = append([]domain.SecurityEvent(nil), m.events...)
	next.tokens = append([]domain.PasswordToken(nil), m.tokens...)
	next.outbox = append([]domain.TokenEvent(nil), m.outbox...)
	if err := fn(&next); err != nil {
		return err
	}
	*m = next
	return nil
}
func (m *adminMemory) Get(_ context.Context, id string) (domain.AuthState, error) {
	s, ok := m.users[id]
	if !ok {
		return s, domain.ErrNotFound
	}
	return s, nil
}
func (m *adminMemory) FindByEmail(_ context.Context, email string) (domain.AuthState, error) {
	for _, s := range m.users {
		if s.User.Email == email {
			return s, nil
		}
	}
	return domain.AuthState{}, domain.ErrNotFound
}
func (m *adminMemory) List(context.Context, string, int) ([]domain.AdminRecord, error) {
	out := []domain.AdminRecord{}
	for _, s := range m.users {
		out = append(out, domain.AdminRecord{User: s.User, TOTPConfirmedAt: s.TOTP.ConfirmedAt})
	}
	return out, nil
}
func (m *adminMemory) CountUsers(context.Context) (int64, error) { return int64(len(m.users)), nil }
func (m *adminMemory) CountActiveOwners(context.Context) (int64, error) {
	var n int64
	for _, s := range m.users {
		if s.User.Status == domain.Active && s.User.Role == domain.Owner {
			n++
		}
	}
	return n, nil
}
func (m *adminMemory) Create(_ context.Context, u domain.User) (domain.User, error) {
	for _, s := range m.users {
		if s.User.Email == u.Email {
			return domain.User{}, domain.ErrEmailConflict
		}
	}
	u.ID = fmt.Sprintf("new-%d", len(m.users))
	u.Version = 1
	u.SessionVersion = 1
	m.users[u.ID] = domain.AuthState{User: u}
	return u, nil
}
func (m *adminMemory) SaveUser(_ context.Context, u domain.User, expected int32) (domain.User, error) {
	old, ok := m.users[u.ID]
	if !ok {
		return domain.User{}, domain.ErrNotFound
	}
	if old.User.Version != expected {
		return domain.User{}, domain.ErrVersionConflict
	}
	old.User = u
	old.User.Version = expected + 1
	m.users[u.ID] = old
	return old.User, nil
}
func (m *adminMemory) SaveProof(_ context.Context, s domain.AuthState) error {
	m.users[s.User.ID] = s
	return nil
}
func (m *adminMemory) ResetTOTP(_ context.Context, id string) error {
	s := m.users[id]
	s.TOTP = domain.TOTPCredential{}
	s.RecoveryHashes = nil
	m.users[id] = s
	return nil
}
func (m *adminMemory) InvalidateTokens(_ context.Context, id string, _ time.Time) error {
	var remaining []domain.PasswordToken
	for _, token := range m.tokens {
		if token.UserID != id {
			remaining = append(remaining, token)
		}
	}
	m.tokens = remaining
	return nil
}
func (m *adminMemory) InsertToken(_ context.Context, p domain.PasswordToken) error {
	m.tokens = append(m.tokens, p)
	return nil
}
func (m *adminMemory) InsertTokenEvent(_ context.Context, e domain.TokenEvent) error {
	if m.failEvent {
		return errors.New("fixture failure")
	}
	m.outbox = append(m.outbox, e)
	return nil
}
func (m *adminMemory) Audit(_ context.Context, e domain.SecurityEvent) error {
	m.events = append(m.events, e)
	return nil
}
func (m *adminMemory) DeleteOldSecurityEvents(context.Context, time.Time, int32) (int64, error) {
	return 0, nil
}

func managementFixture(t *testing.T) (*app.Management, *adminMemory, domain.Session, *time.Time) {
	t.Helper()
	a, m, now, _ := fixture(t)
	m.state.User.Version = 1
	m.state.User.DisplayName = "Owner"
	m.state.TOTP = domain.TOTPCredential{SecretEncrypted: []byte("encrypted:fixture-secret"), ConfirmedAt: now}
	repo := &adminMemory{users: map[string]domain.AuthState{"user": m.state}}
	entropy := make([]byte, 4096)
	for i := range entropy {
		entropy[i] = byte(i)
	}
	issuer, err := app.NewTokenIssuer(cipher{}, cryptography.NewResetTokens(bytes.NewReader(entropy)))
	if err != nil {
		t.Fatal(err)
	}
	service, err := app.NewManagement(repo, a, passwords{}, issuer, app.ManagementConfig{Now: func() time.Time { return *now }, PasswordPolicy: func(p string) error {
		if p == "rejected" {
			return domain.ErrValidation
		}
		return nil
	}})
	if err != nil {
		t.Fatal(err)
	}
	return service, repo, domain.Session{UserID: "user", Version: 1, Stage: domain.Authenticated}, now
}
func TestOwnerManagementAndInvalidation(t *testing.T) {
	for _, tc := range []struct {
		name    string
		stage   domain.Stage
		role    domain.Role
		status  domain.Status
		version int32
		want    error
	}{
		{"staff", domain.Authenticated, domain.Staff, domain.Active, 1, domain.ErrForbidden},
		{"pending", domain.TOTPRequired, domain.Owner, domain.Active, 1, domain.ErrAuthenticationRequired},
		{"disabled", domain.Authenticated, domain.Owner, domain.Disabled, 1, domain.ErrAuthenticationRequired},
		{"revoked", domain.Authenticated, domain.Owner, domain.Active, 2, domain.ErrAuthenticationRequired},
	} {
		t.Run(tc.name, func(t *testing.T) {
			a, m, s, _ := managementFixture(t)
			actor := m.users["user"]
			actor.User.Role = tc.role
			actor.User.Status = tc.status
			actor.User.SessionVersion = tc.version
			m.users["user"] = actor
			s.Stage = tc.stage
			if _, err := a.Get(t.Context(), s, "absent"); !errors.Is(err, tc.want) {
				t.Fatal("unauthorized target existence disclosed")
			}
			if _, err := a.Invite(t.Context(), s, "new@example.test", "New", domain.Staff, domain.AuditContext{}); !errors.Is(err, tc.want) {
				t.Fatal("unauthorized invitation")
			}
			if len(m.users) != 1 || len(m.tokens) != 0 || len(m.outbox) != 0 || len(m.events) != 0 {
				t.Fatal("unauthorized call changed state")
			}
		})
	}
	a, m, s, _ := managementFixture(t)
	disabled := domain.Disabled
	before := m.users["user"]
	if _, err := a.Update(t.Context(), s, "user", 1, domain.UserChanges{Status: &disabled}, domain.AuditContext{}); !errors.Is(err, domain.ErrLastActiveOwner) {
		t.Fatal("last owner disabled")
	}
	if !reflect.DeepEqual(before, m.users["user"]) || len(m.events) != 0 {
		t.Fatal("rejection changed user or audit")
	}
	target := before
	target.User.ID = "target"
	target.User.Email = "target@example.test"
	target.User.Role = domain.Staff
	m.users["target"] = target
	if _, err := a.Update(t.Context(), s, "target", 2, domain.UserChanges{Status: &disabled}, domain.AuditContext{}); !errors.Is(err, domain.ErrVersionConflict) {
		t.Fatal("stale version accepted")
	}
	result, err := a.Update(t.Context(), s, "target", 1, domain.UserChanges{Status: &disabled}, domain.AuditContext{IP: "127.0.0.1"})
	if err != nil || result.User.Status != domain.Disabled || result.User.SessionVersion != 2 || result.User.Version != 2 {
		t.Fatal("disable failed")
	}
	if len(m.events) != 1 || m.events[0].Type != "user_disabled" || m.events[0].UserID != "user" || m.events[0].Metadata.TargetID != "target" {
		t.Fatal("audit lost actor or target")
	}
}
func TestInvitationAtomicity(t *testing.T) {
	a, m, s, now := managementFixture(t)
	record, err := a.Invite(t.Context(), s, " NEW@example.test ", "New", domain.Staff, domain.AuditContext{})
	if err != nil {
		t.Fatal(err)
	}
	if record.User.Email != "new@example.test" || record.TOTPConfirmedAt != nil || record.User.PasswordHash != "hash" || len(m.tokens) != 1 || len(m.outbox) != 1 || len(m.events) != 1 {
		t.Fatal("incomplete invitation")
	}
	if !m.tokens[0].ExpiresAt.Equal(now.Add(30*time.Minute)) || m.outbox[0].Type != "identity.admin_invited" || m.outbox[0].Payload.RawTokenEncrypted == "" {
		t.Fatal("invalid token publication")
	}
	beforeUsers := len(m.users)
	beforeTokens := len(m.tokens)
	beforeEvents := len(m.events)
	if _, err := a.Invite(t.Context(), s, "new@example.test", "Duplicate", domain.Staff, domain.AuditContext{}); !errors.Is(err, domain.ErrEmailConflict) {
		t.Fatal("duplicate accepted")
	}
	if len(m.users) != beforeUsers || len(m.tokens) != beforeTokens || len(m.events) != beforeEvents {
		t.Fatal("duplicate mutated state")
	}
	m.failEvent = true
	if _, err := a.Invite(t.Context(), s, "another@example.test", "Another", domain.Staff, domain.AuditContext{}); err == nil {
		t.Fatal("outbox error ignored")
	}
	if len(m.users) != beforeUsers || len(m.tokens) != beforeTokens || len(m.events) != beforeEvents {
		t.Fatal("outbox failure partially committed")
	}
}
func TestOwnerResetTOTPRequiresFreshProof(t *testing.T) {
	a, m, s, now := managementFixture(t)
	target := m.users["user"]
	target.User.ID = "target"
	target.User.Email = "target@example.test"
	target.RecoveryHashes = []string{domain.HashRecovery("target-recovery")}
	m.users["target"] = target
	if _, err := a.ResetTOTP(t.Context(), s, "user", 1, "correct", domain.Proof{TOTP: "123456"}, domain.AuditContext{}); !errors.Is(err, domain.ErrForbidden) {
		t.Fatal("self reset allowed")
	}
	before := m.users["target"]
	if _, err := a.ResetTOTP(t.Context(), s, "target", 1, "wrong", domain.Proof{TOTP: "123456"}, domain.AuditContext{}); !errors.Is(err, domain.ErrInvalidCredentials) {
		t.Fatal("wrong password accepted")
	}
	if !reflect.DeepEqual(before, m.users["target"]) {
		t.Fatal("failed password altered target")
	}
	if _, err := a.ResetTOTP(t.Context(), s, "target", 2, "correct", domain.Proof{TOTP: "123456"}, domain.AuditContext{}); !errors.Is(err, domain.ErrVersionConflict) {
		t.Fatal("stale reset accepted")
	}
	result, err := a.ResetTOTP(t.Context(), s, "target", 1, "correct", domain.Proof{TOTP: "123456"}, domain.AuditContext{})
	if err != nil || result.User.SessionVersion != 2 || result.User.Version != 2 || result.TOTPConfirmedAt != nil {
		t.Fatal("reset failed")
	}
	if len(m.users["target"].RecoveryHashes) != 0 || len(m.users["target"].TOTP.SecretEncrypted) != 0 {
		t.Fatal("target credentials retained")
	}
	if _, err := a.ResetTOTP(t.Context(), s, "target", 2, "correct", domain.Proof{TOTP: "123456"}, domain.AuditContext{}); !errors.Is(err, domain.ErrInvalidCredentials) {
		t.Fatal("acting owner proof replayed")
	}
	*now = now.Add(30 * time.Second)
	if _, err := a.ResetTOTP(t.Context(), s, "target", 2, "correct", domain.Proof{TOTP: "123456"}, domain.AuditContext{}); err != nil {
		t.Fatal(err)
	}
}
func TestBootstrapAndEmergencyAudits(t *testing.T) {
	a, m, _, _ := managementFixture(t)
	m.users = map[string]domain.AuthState{}
	if _, err := a.Bootstrap(t.Context(), "owner@example.test", "Owner", "rejected"); !errors.Is(err, domain.ErrValidation) {
		t.Fatal("password policy ignored")
	}
	if len(m.users) != 0 {
		t.Fatal("invalid password created user")
	}
	owner, err := a.Bootstrap(t.Context(), "owner@example.test", "Owner", "correct")
	if err != nil || owner.Role != domain.Owner || owner.Status != domain.Active {
		t.Fatal("bootstrap failed")
	}
	if _, err := a.Bootstrap(t.Context(), "other@example.test", "Other", "correct"); !errors.Is(err, domain.ErrBootstrapComplete) {
		t.Fatal("bootstrap not restricted to initial state")
	}
	m.tokens = append(m.tokens, domain.PasswordToken{UserID: owner.ID, Hash: "pending-fixture"})
	if err := a.EmergencyPassword(t.Context(), owner.Email, "correct"); err != nil {
		t.Fatal(err)
	}
	if len(m.tokens) != 0 {
		t.Fatal("emergency password reset retained old password tokens")
	}
	if m.users[owner.ID].User.SessionVersion != 2 {
		t.Fatal("password reset did not revoke sessions")
	}
	if err := a.EmergencyTOTP(t.Context(), owner.Email); err != nil {
		t.Fatal(err)
	}
	if m.users[owner.ID].User.SessionVersion != 3 {
		t.Fatal("TOTP reset did not revoke sessions")
	}
	for _, e := range m.events {
		if e.Metadata.Source != "cli" || e.Metadata.Outcome == "" {
			t.Fatal("CLI audit missing provenance")
		}
	}
}
