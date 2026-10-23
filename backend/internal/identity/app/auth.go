// Package app orchestrates identity use cases through domain ports.
package app

import (
	"context"
	"crypto/subtle"
	"errors"
	"strings"
	"time"

	"github.com/freedomCruz/monte-luna/backend/internal/identity/domain"
)

type AuthConfig struct {
	LockoutThreshold  int32
	LockoutDuration   time.Duration
	RecoveryCount     int
	RecoveryBytes     int
	DummyPasswordHash string
}
type Auth struct {
	repo      domain.AuthRepository
	passwords domain.Passwords
	cipher    domain.SecretCipher
	factors   domain.Factors
	limiter   domain.AuthLimiter
	now       func() time.Time
	config    AuthConfig
}

func NewAuth(repo domain.AuthRepository, passwords domain.Passwords, cipher domain.SecretCipher, factors domain.Factors, limiter domain.AuthLimiter, now func() time.Time, config AuthConfig) (*Auth, error) {
	if repo == nil || passwords == nil || cipher == nil || factors == nil || limiter == nil || now == nil || config.LockoutThreshold < 1 || config.LockoutDuration <= 0 || config.RecoveryCount < 1 || config.RecoveryCount > 100 || config.RecoveryBytes < 16 || config.RecoveryBytes > 128 || config.DummyPasswordHash == "" {
		return nil, domain.ErrValidation
	}
	if _, _, err := passwords.Verify("", config.DummyPasswordHash); err != nil {
		return nil, domain.ErrValidation
	}
	return &Auth{repo, passwords, cipher, factors, limiter, now, config}, nil
}
func (a *Auth) limit(ctx context.Context, account, ip string) error {
	delay, err := a.limiter.Allow(ctx, account, ip, a.now())
	if err != nil {
		return err
	}
	if delay > 0 {
		return &domain.RateLimitError{RetryAfter: delay}
	}
	return nil
}
func (a *Auth) locked(user domain.User) error {
	if user.LockedUntil != nil && user.LockedUntil.After(a.now()) {
		return &domain.RateLimitError{RetryAfter: user.LockedUntil.Sub(a.now())}
	}
	return nil
}
func (a *Auth) failed(s *domain.AuthState, ip string) {
	if s.User.LockedUntil != nil && !s.User.LockedUntil.After(a.now()) {
		s.User.FailedLoginAttempts = 0
		s.User.LockedUntil = nil
	}
	if s.User.FailedLoginAttempts < a.config.LockoutThreshold {
		s.User.FailedLoginAttempts++
	}
	if s.User.FailedLoginAttempts >= a.config.LockoutThreshold {
		until := a.now().Add(a.config.LockoutDuration)
		s.User.LockedUntil = &until
	}
	s.Events = append(s.Events, domain.AuthEvent{Type: "login_failed", IP: ip})
}
func session(s *domain.AuthState, stage domain.Stage) domain.Session {
	return domain.Session{UserID: s.User.ID, Version: s.User.SessionVersion, Stage: stage}
}
func (a *Auth) Login(ctx context.Context, email, password, ip string) (domain.Session, error) {
	email = strings.ToLower(strings.TrimSpace(email))
	if err := a.limit(ctx, email, ip); err != nil {
		return domain.Session{}, err
	}
	var result domain.Session
	var rejected error
	err := a.repo.TransactAuth(ctx, domain.AuthLookup{Email: email}, func(s *domain.AuthState) error {
		if err := a.locked(s.User); err != nil {
			return err
		}
		matches, rehash, err := a.passwords.Verify(password, s.User.PasswordHash)
		if err != nil {
			return err
		}
		if !matches || s.User.Status != domain.Active {
			a.failed(s, ip)
			rejected = domain.ErrInvalidCredentials
			return nil
		}
		if rehash {
			hash, err := a.passwords.Hash(password)
			if err != nil {
				return err
			}
			s.User.PasswordHash = hash
		}
		// Authentication failures are reset only after the lockout expires or full
		// MFA succeeds; knowing a password cannot clear a second-factor lockout.
		if s.User.LockedUntil != nil {
			s.User.FailedLoginAttempts = 0
			s.User.LockedUntil = nil
		}
		stage := domain.EnrollmentRequired
		if s.TOTP.ConfirmedAt != nil {
			stage = domain.TOTPRequired
		}
		result = session(s, stage)
		return nil
	})
	if errors.Is(err, domain.ErrNotFound) {
		_, _, dummyErr := a.passwords.Verify(password, a.config.DummyPasswordHash)
		if dummyErr != nil {
			return domain.Session{}, dummyErr
		}
		if err := a.repo.RecordAnonymousFailure(ctx, ip); err != nil {
			return domain.Session{}, err
		}
		return domain.Session{}, domain.ErrInvalidCredentials
	}
	if err != nil {
		return domain.Session{}, err
	}
	return result, rejected
}
func check(s domain.AuthState, p domain.Session, stage domain.Stage) error {
	if p.UserID == "" || p.UserID != s.User.ID || p.Version != s.User.SessionVersion || s.User.Status != domain.Active || p.Stage != stage {
		return domain.ErrAuthenticationRequired
	}
	if stage == domain.Authenticated || stage == domain.TOTPRequired {
		if s.TOTP.ConfirmedAt == nil {
			return domain.ErrAuthenticationRequired
		}
	}
	if stage != domain.Authenticated && stage != domain.TOTPRequired && stage != domain.EnrollmentRequired {
		return domain.ErrAuthenticationRequired
	}
	return nil
}
func (a *Auth) Validate(ctx context.Context, p domain.Session, stage domain.Stage) (domain.User, error) {
	if p.UserID == "" {
		return domain.User{}, domain.ErrAuthenticationRequired
	}
	s, err := a.repo.ReadAuth(ctx, p.UserID)
	if errors.Is(err, domain.ErrNotFound) {
		return domain.User{}, domain.ErrAuthenticationRequired
	}
	if err != nil {
		return domain.User{}, err
	}
	if err := check(s, p, stage); err != nil {
		return domain.User{}, err
	}
	return s.User, nil
}

type Enrollment struct {
	Secret string
	URI    string
}

func purpose(id string) string { return "identity.totp:" + id }
func (a *Auth) Enroll(ctx context.Context, p domain.Session, ip string) (Enrollment, error) {
	if err := a.limit(ctx, p.UserID, ip); err != nil {
		return Enrollment{}, err
	}
	var result Enrollment
	err := a.repo.TransactAuth(ctx, domain.AuthLookup{ID: p.UserID}, func(s *domain.AuthState) error {
		if err := check(*s, p, domain.EnrollmentRequired); err != nil {
			return err
		}
		if s.TOTP.ConfirmedAt != nil {
			return domain.ErrTOTPEnrolled
		}
		if err := a.locked(s.User); err != nil {
			return err
		}
		secret, uri, err := a.factors.Generate(s.User.Email)
		if err != nil {
			return err
		}
		encrypted, err := a.cipher.Seal([]byte(secret), purpose(s.User.ID))
		if err != nil {
			return err
		}
		s.TOTP = domain.TOTPCredential{SecretEncrypted: encrypted}
		result = Enrollment{secret, uri}
		return nil
	})
	return result, authNotFound(err)
}
func authNotFound(err error) error {
	if errors.Is(err, domain.ErrNotFound) {
		return domain.ErrAuthenticationRequired
	}
	return err
}
func (a *Auth) consume(s *domain.AuthState, p domain.Proof) (bool, error) {
	if p.RecoveryCode != "" {
		hash := domain.HashRecovery(p.RecoveryCode)
		for i, h := range s.RecoveryHashes {
			if subtle.ConstantTimeCompare([]byte(h), []byte(hash)) == 1 {
				s.RecoveryHashes = append(s.RecoveryHashes[:i], s.RecoveryHashes[i+1:]...)
				return true, nil
			}
		}
		return false, nil
	}
	if len(s.TOTP.SecretEncrypted) == 0 {
		return false, nil
	}
	secret, err := a.cipher.Open(s.TOTP.SecretEncrypted, purpose(s.User.ID))
	if err != nil {
		return false, err
	}
	step, valid := a.factors.Verify(string(secret), p.TOTP, a.now())
	if !valid || (s.TOTP.LastUsedStep != nil && step <= *s.TOTP.LastUsedStep) {
		return false, nil
	}
	s.TOTP.LastUsedStep = &step
	return true, nil
}
func (a *Auth) codes(s *domain.AuthState) ([]string, error) {
	codes, err := a.factors.RecoveryCodes(a.config.RecoveryCount, a.config.RecoveryBytes)
	if err != nil {
		return nil, err
	}
	s.RecoveryHashes = make([]string, len(codes))
	for i, c := range codes {
		s.RecoveryHashes[i] = domain.HashRecovery(c)
	}
	return codes, nil
}
func (a *Auth) succeed(s *domain.AuthState, ip string) {
	now := a.now()
	s.User.LastLoginAt = &now
	s.User.FailedLoginAttempts = 0
	s.User.LockedUntil = nil
	s.Events = append(s.Events, domain.AuthEvent{Type: "login_succeeded", IP: ip})
}
func (a *Auth) Confirm(ctx context.Context, p domain.Session, code, ip string) (domain.Session, []string, error) {
	if len(code) != 6 {
		return domain.Session{}, nil, domain.ErrValidation
	}
	if err := a.limit(ctx, p.UserID, ip); err != nil {
		return domain.Session{}, nil, err
	}
	var full domain.Session
	var codes []string
	var rejected error
	err := a.repo.TransactAuth(ctx, domain.AuthLookup{ID: p.UserID}, func(s *domain.AuthState) error {
		if err := check(*s, p, domain.EnrollmentRequired); err != nil {
			return err
		}
		if s.TOTP.ConfirmedAt != nil {
			return domain.ErrTOTPEnrolled
		}
		if err := a.locked(s.User); err != nil {
			return err
		}
		valid, err := a.consume(s, domain.Proof{TOTP: code})
		if err != nil {
			return err
		}
		if !valid {
			a.failed(s, ip)
			rejected = domain.ErrInvalidCredentials
			return nil
		}
		codes, err = a.codes(s)
		if err != nil {
			return err
		}
		now := a.now()
		s.TOTP.ConfirmedAt = &now
		s.Events = append(s.Events, domain.AuthEvent{Type: "totp_enabled", IP: ip})
		a.succeed(s, ip)
		full = session(s, domain.Authenticated)
		return nil
	})
	if err != nil {
		return domain.Session{}, nil, authNotFound(err)
	}
	return full, codes, rejected
}
func (a *Auth) Verify(ctx context.Context, p domain.Session, proof domain.Proof, ip string) (domain.Session, error) {
	if !proof.Valid() {
		return domain.Session{}, domain.ErrValidation
	}
	if err := a.limit(ctx, p.UserID, ip); err != nil {
		return domain.Session{}, err
	}
	var full domain.Session
	var rejected error
	err := a.repo.TransactAuth(ctx, domain.AuthLookup{ID: p.UserID}, func(s *domain.AuthState) error {
		if err := check(*s, p, domain.TOTPRequired); err != nil {
			return err
		}
		if err := a.locked(s.User); err != nil {
			return err
		}
		valid, err := a.consume(s, proof)
		if err != nil {
			return err
		}
		if !valid {
			a.failed(s, ip)
			rejected = domain.ErrInvalidCredentials
			return nil
		}
		if proof.RecoveryCode != "" {
			s.Events = append(s.Events, domain.AuthEvent{Type: "recovery_code_used", IP: ip})
		}
		a.succeed(s, ip)
		full = session(s, domain.Authenticated)
		return nil
	})
	if err != nil {
		return domain.Session{}, authNotFound(err)
	}
	return full, rejected
}
func (a *Auth) Regenerate(ctx context.Context, p domain.Session, password string, proof domain.Proof, ip string) ([]string, error) {
	if !proof.Valid() {
		return nil, domain.ErrValidation
	}
	if err := a.limit(ctx, p.UserID, ip); err != nil {
		return nil, err
	}
	var codes []string
	var rejected error
	err := a.repo.TransactAuth(ctx, domain.AuthLookup{ID: p.UserID}, func(s *domain.AuthState) error {
		if err := check(*s, p, domain.Authenticated); err != nil {
			return err
		}
		if err := a.locked(s.User); err != nil {
			return err
		}
		matches, _, err := a.passwords.Verify(password, s.User.PasswordHash)
		if err != nil {
			return err
		}
		if !matches {
			a.failed(s, ip)
			rejected = domain.ErrInvalidCredentials
			return nil
		}
		valid, err := a.consume(s, proof)
		if err != nil {
			return err
		}
		if !valid {
			a.failed(s, ip)
			rejected = domain.ErrInvalidCredentials
			return nil
		}
		if proof.RecoveryCode != "" {
			s.Events = append(s.Events, domain.AuthEvent{Type: "recovery_code_used", IP: ip})
		}
		codes, err = a.codes(s)
		return err
	})
	if err != nil {
		return nil, authNotFound(err)
	}
	return codes, rejected
}

// Logout records no credential material and is idempotent for absent users.
// The session adapter must destroy SCS state even if this audit call fails.
func (a *Auth) Logout(ctx context.Context, p domain.Session, ip string) error {
	if p.UserID == "" {
		return nil
	}
	err := a.repo.TransactAuth(ctx, domain.AuthLookup{ID: p.UserID}, func(s *domain.AuthState) error {
		s.Events = append(s.Events, domain.AuthEvent{Type: "logout", IP: ip})
		return nil
	})
	if errors.Is(err, domain.ErrNotFound) {
		return nil
	}
	return err
}
