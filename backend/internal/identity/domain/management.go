package domain

import (
	"context"
	"errors"
	"time"
)

var (
	ErrForbidden         = errors.New("forbidden")
	ErrBootstrapComplete = errors.New("initial owner already exists")
)

// CanAccess denies unknown areas as well as unknown roles. Caller identity and
// current session_version must be checked before applying this pure policy.
func CanAccess(role Role, resource string) bool {
	switch resource {
	case "catalog", "inventory", "orders", "identity-self":
		return role == Owner || role == Staff
	case "identity", "invoicing", "payments", "shipping", "promotions", "notifications":
		return role == Owner
	default:
		return false
	}
}

type AuditContext struct {
	IP        string
	UserAgent string
}

// EventMetadata is deliberately closed; secrets and arbitrary request data
// cannot be copied into the audit ledger through a generic metadata map.
type EventMetadata struct {
	Source   string `json:"source,omitempty"`
	TargetID string `json:"target_id,omitempty"`
	Outcome  string `json:"outcome,omitempty"`
}
type SecurityEvent struct {
	UserID    string
	Type      string
	Context   AuditContext
	Metadata  EventMetadata
	CreatedAt time.Time
}
type AdminRecord struct {
	User            User
	TOTPConfirmedAt *time.Time
}
type PasswordToken struct {
	UserID    string
	Hash      string
	CreatedAt time.Time
	ExpiresAt time.Time
}
type TokenEvent struct {
	Type       string
	OccurredAt time.Time
	Payload    PasswordTokenPayload
}
type PasswordPolicy func(string) error

// AdminTx runs only inside a lifecycle-serialized transaction. No adapter
// exposes it over HTTP. Methods accept internal domain records, never JSON.
type AdminTx interface {
	Get(context.Context, string) (AuthState, error)
	FindByEmail(context.Context, string) (AuthState, error)
	List(context.Context, string, int) ([]AdminRecord, error)
	CountUsers(context.Context) (int64, error)
	CountActiveOwners(context.Context) (int64, error)
	Create(context.Context, User) (User, error)
	SaveUser(context.Context, User, int32) (User, error)
	SaveProof(context.Context, AuthState) error
	ResetTOTP(context.Context, string) error
	InvalidateTokens(context.Context, string, time.Time) error
	InsertToken(context.Context, PasswordToken) error
	InsertTokenEvent(context.Context, TokenEvent) error
	Audit(context.Context, SecurityEvent) error
}
type AdminRepository interface {
	Manage(context.Context, func(AdminTx) error) error
	DeleteOldSecurityEvents(context.Context, time.Time, int32) (int64, error)
}
