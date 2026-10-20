package app

import (
	"context"
	"strings"
	"time"

	"github.com/freedomCruz/monte-luna/backend/internal/identity/domain"
)

type ManagementConfig struct {
	Now            func() time.Time
	PasswordPolicy domain.PasswordPolicy
}
type Management struct {
	repo      domain.AdminRepository
	auth      *Auth
	passwords domain.Passwords
	issuer    *TokenIssuer
	config    ManagementConfig
}

func NewManagement(repo domain.AdminRepository, auth *Auth, passwords domain.Passwords, issuer *TokenIssuer, config ManagementConfig) (*Management, error) {
	if repo == nil || auth == nil || passwords == nil || issuer == nil || config.Now == nil || config.PasswordPolicy == nil {
		return nil, domain.ErrValidation
	}
	return &Management{repo, auth, passwords, issuer, config}, nil
}
func (a *Auth) Authorize(ctx context.Context, p domain.Session, resource string) (domain.User, error) {
	user, err := a.Validate(ctx, p, domain.Authenticated)
	if err != nil {
		return domain.User{}, err
	}
	if !domain.CanAccess(user.Role, resource) {
		return domain.User{}, domain.ErrForbidden
	}
	return user, nil
}
func owner(ctx context.Context, tx domain.AdminTx, p domain.Session) (domain.AuthState, error) {
	s, err := tx.Get(ctx, p.UserID)
	if err != nil {
		return s, authNotFound(err)
	}
	if err := check(s, p, domain.Authenticated); err != nil {
		return s, err
	}
	if s.User.Role != domain.Owner {
		return s, domain.ErrForbidden
	}
	return s, nil
}
func record(s domain.AuthState) domain.AdminRecord {
	return domain.AdminRecord{User: s.User, TOTPConfirmedAt: s.TOTP.ConfirmedAt}
}
func (a *Management) Get(ctx context.Context, p domain.Session, id string) (domain.AdminRecord, error) {
	var out domain.AdminRecord
	err := a.repo.Manage(ctx, func(tx domain.AdminTx) error {
		if _, err := owner(ctx, tx, p); err != nil {
			return err
		}
		s, err := tx.Get(ctx, id)
		if err != nil {
			return err
		}
		out = record(s)
		return nil
	})
	return out, err
}
func (a *Management) List(ctx context.Context, p domain.Session, after string, limit int) ([]domain.AdminRecord, error) {
	var out []domain.AdminRecord
	err := a.repo.Manage(ctx, func(tx domain.AdminTx) error {
		if _, err := owner(ctx, tx, p); err != nil {
			return err
		}
		if limit < 1 || limit > 100 {
			return domain.ErrValidation
		}
		var err error
		out, err = tx.List(ctx, after, limit)
		return err
	})
	return out, err
}
func (a *Management) Invite(ctx context.Context, p domain.Session, email, name string, role domain.Role, audit domain.AuditContext) (domain.AdminRecord, error) {
	var out domain.AdminRecord
	err := a.repo.Manage(ctx, func(tx domain.AdminTx) error {
		if _, err := owner(ctx, tx, p); err != nil {
			return err
		}
		user, err := domain.NewUser(email, name, role, domain.Active)
		if err != nil {
			return err
		}
		// This random password is not returned to the owner or the recipient. The
		// recipient establishes the real password through the invitation token.
		unknown, _, err := a.issuer.random.Generate()
		if err != nil {
			return err
		}
		user.PasswordHash, err = a.passwords.Hash(unknown)
		if err != nil {
			return err
		}
		user, err = tx.Create(ctx, user)
		if err != nil {
			return err
		}
		token, event, err := a.issuer.Issue(user, "identity.admin_invited", a.config.Now())
		if err != nil {
			return err
		}
		if err := tx.InsertToken(ctx, token); err != nil {
			return err
		}
		if err := tx.InsertTokenEvent(ctx, event); err != nil {
			return err
		}
		if err := tx.Audit(ctx, domain.SecurityEvent{UserID: p.UserID, Type: "user_created", Context: audit, Metadata: domain.EventMetadata{TargetID: user.ID}}); err != nil {
			return err
		}
		out = domain.AdminRecord{User: user}
		return nil
	})
	if err != nil {
		return domain.AdminRecord{}, err
	}
	return out, nil
}
func (a *Management) Update(ctx context.Context, p domain.Session, id string, expected int32, changes domain.UserChanges, audit domain.AuditContext) (domain.AdminRecord, error) {
	var out domain.AdminRecord
	err := a.repo.Manage(ctx, func(tx domain.AdminTx) error {
		if _, err := owner(ctx, tx, p); err != nil {
			return err
		}
		target, err := tx.Get(ctx, id)
		if err != nil {
			return err
		}
		if expected < 1 || target.User.Version != expected {
			return domain.ErrVersionConflict
		}
		if changes.Email == nil && changes.DisplayName == nil && changes.Role == nil && changes.Status == nil {
			return domain.ErrValidation
		}
		count, err := tx.CountActiveOwners(ctx)
		if err != nil {
			return err
		}
		changed, err := target.User.Apply(changes, int(count))
		if err != nil {
			return err
		}
		changed, err = tx.SaveUser(ctx, changed, expected)
		if err != nil {
			return err
		}
		events := []string{}
		if changed.Role != target.User.Role {
			events = append(events, "role_changed")
		}
		if changed.Status == domain.Disabled && target.User.Status != domain.Disabled {
			events = append(events, "user_disabled")
		}
		for _, kind := range events {
			if err := tx.Audit(ctx, domain.SecurityEvent{UserID: p.UserID, Type: kind, Context: audit, Metadata: domain.EventMetadata{TargetID: id}}); err != nil {
				return err
			}
		}
		out = domain.AdminRecord{User: changed, TOTPConfirmedAt: target.TOTP.ConfirmedAt}
		return nil
	})
	if err != nil {
		return domain.AdminRecord{}, err
	}
	return out, nil
}
func (a *Management) ResetTOTP(ctx context.Context, p domain.Session, id string, expected int32, password string, proof domain.Proof, audit domain.AuditContext) (domain.AdminRecord, error) {
	if !proof.Valid() {
		return domain.AdminRecord{}, domain.ErrValidation
	}
	if err := a.auth.limit(ctx, p.UserID, audit.IP); err != nil {
		return domain.AdminRecord{}, err
	}
	var out domain.AdminRecord
	var rejected error
	err := a.repo.Manage(ctx, func(tx domain.AdminTx) error {
		actor, err := owner(ctx, tx, p)
		if err != nil {
			return err
		}
		if id == p.UserID {
			return domain.ErrForbidden
		}
		target, err := tx.Get(ctx, id)
		if err != nil {
			return err
		}
		if expected < 1 || target.User.Version != expected {
			return domain.ErrVersionConflict
		}
		if err := a.auth.locked(actor.User); err != nil {
			return err
		}
		matches, _, err := a.passwords.Verify(password, actor.User.PasswordHash)
		if err != nil {
			return err
		}
		valid := false
		if matches {
			valid, err = a.auth.consume(&actor, proof)
			if err != nil {
				return err
			}
		}
		if !valid {
			a.auth.failed(&actor, audit.IP)
			rejected = domain.ErrInvalidCredentials
			return tx.SaveProof(ctx, actor)
		}
		if proof.RecoveryCode != "" {
			actor.Events = append(actor.Events, domain.AuthEvent{Type: "recovery_code_used", IP: audit.IP})
		}
		if err := tx.SaveProof(ctx, actor); err != nil {
			return err
		}
		if err := tx.ResetTOTP(ctx, id); err != nil {
			return err
		}
		target.User.SessionVersion++
		target.User.Version++
		target.User, err = tx.SaveUser(ctx, target.User, expected)
		if err != nil {
			return err
		}
		if err := tx.Audit(ctx, domain.SecurityEvent{UserID: p.UserID, Type: "totp_reset", Context: audit, Metadata: domain.EventMetadata{TargetID: id}}); err != nil {
			return err
		}
		out = domain.AdminRecord{User: target.User}
		return nil
	})
	if err != nil {
		return domain.AdminRecord{}, err
	}
	return out, rejected
}

// CLI operations have no HTTP entry points. SSH/process execution is their
// trust boundary. Every attempted operational command is audited, including
// rejection, without passwords, email input, or internal error text in metadata.
func (a *Management) cliOperation(ctx context.Context, kind string, run func(domain.AdminTx) error) error {
	err := a.repo.Manage(ctx, run)
	if err == nil {
		return nil
	}
	auditErr := a.repo.Manage(ctx, func(tx domain.AdminTx) error {
		return tx.Audit(ctx, domain.SecurityEvent{Type: kind, Metadata: domain.EventMetadata{Source: "cli", Outcome: "failed"}})
	})
	if auditErr != nil {
		return auditErr
	}
	return err
}
func cliAudit(ctx context.Context, tx domain.AdminTx, kind, id string) error {
	return tx.Audit(ctx, domain.SecurityEvent{Type: kind, Metadata: domain.EventMetadata{Source: "cli", Outcome: "succeeded", TargetID: id}})
}
func (a *Management) validatePassword(password string) error {
	if password == "" {
		return domain.ErrValidation
	}
	return a.config.PasswordPolicy(password)
}
func (a *Management) Bootstrap(ctx context.Context, email, name, password string) (domain.User, error) {
	var out domain.User
	err := a.cliOperation(ctx, "user_created", func(tx domain.AdminTx) error {
		if err := a.validatePassword(password); err != nil {
			return err
		}
		n, err := tx.CountUsers(ctx)
		if err != nil {
			return err
		}
		if n != 0 {
			return domain.ErrBootstrapComplete
		}
		user, err := domain.NewUser(email, name, domain.Owner, domain.Active)
		if err != nil {
			return err
		}
		user.PasswordHash, err = a.passwords.Hash(password)
		if err != nil {
			return err
		}
		user, err = tx.Create(ctx, user)
		if err != nil {
			return err
		}
		if err := cliAudit(ctx, tx, "user_created", user.ID); err != nil {
			return err
		}
		out = user
		return nil
	})
	if err != nil {
		return domain.User{}, err
	}
	return out, nil
}
func (a *Management) EmergencyPassword(ctx context.Context, email, password string) error {
	return a.cliOperation(ctx, "password_changed", func(tx domain.AdminTx) error {
		if err := a.validatePassword(password); err != nil {
			return err
		}
		s, err := tx.FindByEmail(ctx, strings.ToLower(strings.TrimSpace(email)))
		if err != nil {
			return err
		}
		hash, err := a.passwords.Hash(password)
		if err != nil {
			return err
		}
		expected := s.User.Version
		s.User.PasswordHash = hash
		s.User.PasswordChangedAt = a.config.Now()
		s.User.SessionVersion++
		s.User.Version++
		if _, err := tx.SaveUser(ctx, s.User, expected); err != nil {
			return err
		}
		if err := tx.InvalidateTokens(ctx, s.User.ID, a.config.Now()); err != nil {
			return err
		}
		return cliAudit(ctx, tx, "password_changed", s.User.ID)
	})
}
func (a *Management) EmergencyTOTP(ctx context.Context, email string) error {
	return a.cliOperation(ctx, "totp_reset", func(tx domain.AdminTx) error {
		s, err := tx.FindByEmail(ctx, strings.ToLower(strings.TrimSpace(email)))
		if err != nil {
			return err
		}
		if err := tx.ResetTOTP(ctx, s.User.ID); err != nil {
			return err
		}
		expected := s.User.Version
		s.User.SessionVersion++
		s.User.Version++
		if _, err := tx.SaveUser(ctx, s.User, expected); err != nil {
			return err
		}
		return cliAudit(ctx, tx, "totp_reset", s.User.ID)
	})
}
func (a *Management) CleanupSecurityEvents(ctx context.Context, batch int32) (int64, error) {
	if batch < 1 || batch > 10000 {
		return 0, domain.ErrValidation
	}
	return a.repo.DeleteOldSecurityEvents(ctx, a.config.Now(), batch)
}

// Profile returns the caller's safe administrator record. Only a fully
// authenticated session with the current session_version qualifies.
func (a *Auth) Profile(ctx context.Context, p domain.Session) (domain.AdminRecord, error) {
	if p.UserID == "" {
		return domain.AdminRecord{}, domain.ErrAuthenticationRequired
	}
	s, err := a.repo.ReadAuth(ctx, p.UserID)
	if err != nil {
		return domain.AdminRecord{}, authNotFound(err)
	}
	if err := check(s, p, domain.Authenticated); err != nil {
		return domain.AdminRecord{}, err
	}
	return record(s), nil
}

// Page reads one more record than requested so callers can tell whether a
// following page exists without issuing an empty trailing page.
func (a *Management) Page(ctx context.Context, p domain.Session, after string, limit int) ([]domain.AdminRecord, bool, error) {
	if limit < 1 || limit > 100 {
		if err := a.repo.Manage(ctx, func(tx domain.AdminTx) error { _, err := owner(ctx, tx, p); return err }); err != nil {
			return nil, false, err
		}
		return nil, false, domain.ErrValidation
	}
	var out []domain.AdminRecord
	err := a.repo.Manage(ctx, func(tx domain.AdminTx) error {
		if _, err := owner(ctx, tx, p); err != nil {
			return err
		}
		var err error
		out, err = tx.List(ctx, after, limit+1)
		return err
	})
	if err != nil {
		return nil, false, err
	}
	if len(out) > limit {
		return out[:limit], true, nil
	}
	return out, false, nil
}

// ChangePassword requires the current password and one fresh second factor.
// Success revokes every session, including the caller's; failures count toward
// lockout and change no credential.
func (a *Management) ChangePassword(ctx context.Context, p domain.Session, current, next string, proof domain.Proof, audit domain.AuditContext) error {
	if !proof.Valid() || current == "" {
		return domain.ErrValidation
	}
	if err := a.validatePassword(next); err != nil {
		return err
	}
	if err := a.auth.limit(ctx, p.UserID, audit.IP); err != nil {
		return err
	}
	hash, err := a.passwords.Hash(next)
	if err != nil {
		return err
	}
	var rejected error
	err = a.repo.Manage(ctx, func(tx domain.AdminTx) error {
		actor, err := tx.Get(ctx, p.UserID)
		if err != nil {
			return authNotFound(err)
		}
		if err := check(actor, p, domain.Authenticated); err != nil {
			return err
		}
		if err := a.auth.locked(actor.User); err != nil {
			return err
		}
		matches, _, err := a.passwords.Verify(current, actor.User.PasswordHash)
		if err != nil {
			return err
		}
		valid := false
		if matches {
			valid, err = a.auth.consume(&actor, proof)
			if err != nil {
				return err
			}
		}
		if !valid {
			a.auth.failed(&actor, audit.IP)
			rejected = domain.ErrInvalidCredentials
			return tx.SaveProof(ctx, actor)
		}
		if proof.RecoveryCode != "" {
			actor.Events = append(actor.Events, domain.AuthEvent{Type: "recovery_code_used", IP: audit.IP})
		}
		if err := tx.SaveProof(ctx, actor); err != nil {
			return err
		}
		expected := actor.User.Version
		actor.User.PasswordHash = hash
		actor.User.PasswordChangedAt = a.config.Now()
		actor.User.SessionVersion++
		if _, err := tx.SaveUser(ctx, actor.User, expected); err != nil {
			return err
		}
		return tx.Audit(ctx, domain.SecurityEvent{UserID: p.UserID, Type: "password_changed", Context: audit})
	})
	if err != nil {
		return err
	}
	return rejected
}
