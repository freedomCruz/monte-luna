package app_test

import (
	"errors"
	"testing"
	"time"

	"github.com/freedomCruz/monte-luna/backend/internal/identity/app"
	"github.com/freedomCruz/monte-luna/backend/internal/identity/domain"
)

func TestChangePasswordRevokesSessionsAndConsumesProof(t *testing.T) {
	for _, tc := range []struct {
		name, current, next string
		proof               domain.Proof
		want                error
	}{
		{"wrong password", "wrong", "new password value", domain.Proof{TOTP: "123456"}, domain.ErrInvalidCredentials},
		{"wrong proof", "correct", "new password value", domain.Proof{TOTP: "000000"}, domain.ErrInvalidCredentials},
		{"policy rejection", "correct", "rejected", domain.Proof{TOTP: "123456"}, domain.ErrValidation},
		{"missing proof", "correct", "new password value", domain.Proof{}, domain.ErrValidation},
		{"success", "correct", "new password value", domain.Proof{TOTP: "123456"}, nil},
	} {
		t.Run(tc.name, func(t *testing.T) {
			service, repo, session, now := managementFixture(t)
			before := repo.users["user"]
			err := service.ChangePassword(t.Context(), session, tc.current, tc.next, tc.proof, domain.AuditContext{IP: "192.0.2.1"})
			if !errors.Is(err, tc.want) {
				t.Fatalf("error %v want %v", err, tc.want)
			}
			after := repo.users["user"]
			if tc.want != nil {
				if after.User.SessionVersion != before.User.SessionVersion || after.User.PasswordChangedAt != before.User.PasswordChangedAt || len(repo.events) != 0 {
					t.Fatal("rejected change mutated credentials or audit")
				}
				if errors.Is(tc.want, domain.ErrInvalidCredentials) && after.User.FailedLoginAttempts != before.User.FailedLoginAttempts+1 {
					t.Fatal("failed proof did not count toward lockout")
				}
				return
			}
			if after.User.SessionVersion != before.User.SessionVersion+1 || after.User.Version != before.User.Version+1 || !after.User.PasswordChangedAt.Equal(*now) || after.TOTP.LastUsedStep == nil {
				t.Fatalf("change not applied: %+v", after.User)
			}
			if len(repo.events) != 1 || repo.events[0].Type != "password_changed" || repo.events[0].UserID != "user" {
				t.Fatalf("audit %+v", repo.events)
			}
			if err := service.ChangePassword(t.Context(), session, "correct", "another password", domain.Proof{TOTP: "123456"}, domain.AuditContext{}); !errors.Is(err, domain.ErrAuthenticationRequired) {
				t.Fatal("revoked session still changes password")
			}
		})
	}
}

func TestProfileReturnsOnlyAuthenticatedRecord(t *testing.T) {
	a, m, now, _ := fixture(t)
	m.state.TOTP = domain.TOTPCredential{ConfirmedAt: now}
	full := domain.Session{UserID: "user", Version: 1, Stage: domain.Authenticated}
	record, err := a.Profile(t.Context(), full)
	if err != nil || record.User.ID != "user" || record.TOTPConfirmedAt == nil || !record.TOTPConfirmedAt.Equal(*now) {
		t.Fatalf("profile %+v %v", record, err)
	}
	for _, s := range []domain.Session{{UserID: "user", Version: 1, Stage: domain.TOTPRequired}, {UserID: "user", Version: 2, Stage: domain.Authenticated}, {}} {
		if _, err := a.Profile(t.Context(), s); !errors.Is(err, domain.ErrAuthenticationRequired) {
			t.Fatalf("stage %+v accepted", s)
		}
	}
}

func TestPageReportsFollowingRecords(t *testing.T) {
	service, repo, session, _ := managementFixture(t)
	repo.users["second"] = domain.AuthState{User: domain.User{ID: "second", Email: "second@example.test", Role: domain.Staff, Status: domain.Active, Version: 1, SessionVersion: 1}}
	page, more, err := service.Page(t.Context(), session, "", 1)
	if err != nil || len(page) != 1 || !more {
		t.Fatalf("page %d more=%v err=%v", len(page), more, err)
	}
	page, more, err = service.Page(t.Context(), session, "", 100)
	if err != nil || len(page) != 2 || more {
		t.Fatalf("full page %d more=%v err=%v", len(page), more, err)
	}
	for _, limit := range []int{0, 101} {
		if _, _, err := service.Page(t.Context(), session, "", limit); !errors.Is(err, domain.ErrValidation) {
			t.Fatalf("limit %d accepted", limit)
		}
	}
}

func TestApprovedRecoveryCodeSizeAccepted(t *testing.T) {
	if _, err := app.NewAuth(&memory{}, passwords{}, cipher{}, &factors{}, &limiter{}, nowFixture, app.AuthConfig{LockoutThreshold: 5, LockoutDuration: 1, RecoveryCount: 10, RecoveryBytes: 10, DummyPasswordHash: "hash"}); err != nil {
		t.Fatal(err)
	}
	if _, err := app.NewAuth(&memory{}, passwords{}, cipher{}, &factors{}, &limiter{}, nowFixture, app.AuthConfig{LockoutThreshold: 5, LockoutDuration: 1, RecoveryCount: 10, RecoveryBytes: 9, DummyPasswordHash: "hash"}); err == nil {
		t.Fatal("recovery codes below 10 bytes accepted")
	}
}

func nowFixture() time.Time { return time.Unix(1800000000, 0).UTC() }
