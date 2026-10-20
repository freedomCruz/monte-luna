package domain

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"time"
)

var (
	ErrInvalidCredentials     = errors.New("invalid credentials")
	ErrAuthenticationRequired = errors.New("authentication required")
	ErrRateLimited            = errors.New("rate limited")
	ErrTOTPEnrolled           = errors.New("TOTP already enrolled")
)

type Stage string

const (
	EnrollmentRequired Stage = "enrollment_required"
	TOTPRequired       Stage = "totp_required"
	Authenticated      Stage = "authenticated"
)

// Session is server-side state, never an API response.
type Session struct {
	UserID  string
	Version int32
	Stage   Stage
}
type Proof struct {
	TOTP         string
	RecoveryCode string
}

func (p Proof) Valid() bool { return (p.TOTP != "") != (p.RecoveryCode != "") }

type TOTPCredential struct {
	SecretEncrypted []byte
	ConfirmedAt     *time.Time
	LastUsedStep    *int64
}
type AuthEvent struct {
	Type string
	IP   string
}
type AuthState struct {
	User           User
	TOTP           TOTPCredential
	RecoveryHashes []string
	Events         []AuthEvent
}
type AuthLookup struct {
	ID    string
	Email string
}

// TransactAuth locks the user and all authentication state, commits callback
// mutations and audit events together, and rolls back if the callback fails.
// Callbacks must not perform irreversible external side effects.
type AuthRepository interface {
	ReadAuth(context.Context, string) (AuthState, error)
	RecordAnonymousFailure(context.Context, string) error
	TransactAuth(context.Context, AuthLookup, func(*AuthState) error) error
}
type Passwords interface {
	Verify(string, string) (bool, bool, error)
	Hash(string) (string, error)
}
type SecretCipher interface {
	Seal([]byte, string) ([]byte, error)
	Open([]byte, string) ([]byte, error)
}
type Factors interface {
	Generate(string) (secret, uri string, err error)
	Verify(string, string, time.Time) (step int64, valid bool)
	RecoveryCodes(count, bytes int) ([]string, error)
}
type AuthLimiter interface {
	Allow(context.Context, string, string, time.Time) (time.Duration, error)
}
type RateLimitError struct{ RetryAfter time.Duration }

func (e *RateLimitError) Error() string { return ErrRateLimited.Error() }
func (e *RateLimitError) Unwrap() error { return ErrRateLimited }
func HashRecovery(code string) string {
	sum := sha256.Sum256([]byte(code))
	return hex.EncodeToString(sum[:])
}
