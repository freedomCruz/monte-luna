package domain

import (
	"context"
	"errors"
	"time"
)

var (
	ErrInvalidResetToken = errors.New("invalid password reset token")
	ErrResetUnavailable  = errors.New("password reset unavailable")
)

const PasswordResetLifetime = 30 * time.Minute

// PasswordResetIssue contains only material safe to persist. Plaintext tokens
// exist only in the caller's memory and never cross the repository boundary.
type PasswordResetIssue struct {
	TokenHash         string
	RawTokenEncrypted string
}

// PasswordTokenPayload is shared by both token events. Role is set only for
// identity.admin_invited (the role assigned at creation) and is omitted from
// identity.password_reset_requested.
type PasswordTokenPayload struct {
	AdminUserID       string `json:"admin_user_id"`
	Email             string `json:"email"`
	DisplayName       string `json:"display_name"`
	Role              Role   `json:"role,omitempty"`
	RawTokenEncrypted string `json:"raw_token_encrypted"`
}

// PasswordResetPurpose is shared by invitation and reset email consumers.
func PasswordResetPurpose(userID string) string { return "identity.password-token:" + userID }

type ResetTokens interface {
	Generate() (raw, hash string, err error)
	Hash(string) (string, error)
}
type PasswordResetRepository interface {
	// IssuePasswordReset locks the active administrator, invalidates unused
	// tokens and atomically stores the factory result, outbox event and audit.
	// Missing/disabled accounts return nil without invoking the factory.
	IssuePasswordReset(context.Context, string, time.Time, func(User) (PasswordResetIssue, error)) error
	PasswordResetAccount(context.Context, string, time.Time) (string, error)
	// CompletePasswordReset rechecks token/user under locks; consumption,
	// password replacement, session revocation and audit commit together.
	CompletePasswordReset(context.Context, string, string, time.Time, string) error
}
