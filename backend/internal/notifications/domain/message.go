// Package domain defines notification persistence without provider or database dependencies.
package domain

import (
	"context"
	"errors"
	"net/mail"
	"regexp"
	"strings"
	"time"
)

// TemplateData is the durable allowlist. Tokens, links and rendered bodies have
// no fields here: consumers must keep those values in process memory only.
type TemplateData struct {
	AdminUserID string `json:"admin_user_id,omitempty"`
	DisplayName string `json:"display_name,omitempty"`
}

type Intake struct {
	SourceEventID  string
	EventType      string
	TemplateKey    string
	RecipientEmail string
	TemplateData   TemplateData
}

var ErrInvalidIntake = errors.New("invalid notification intake")

func validUUID(id string) bool {
	return regexp.MustCompile(`^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-7[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$`).MatchString(id)
}

func ValidEmail(email string) bool {
	parsed, err := mail.ParseAddress(email)
	return err == nil && parsed.Address == email && strings.TrimSpace(email) == email && !strings.ContainsAny(email, "\r\n")
}

func (in Intake) Validate() error {
	if !validUUID(in.SourceEventID) || !ValidEmail(in.RecipientEmail) || !regexp.MustCompile(`^[a-z][a-z0-9_]*$`).MatchString(in.TemplateKey) {
		return ErrInvalidIntake
	}
	if in.EventType != "identity.password_reset_requested" && in.EventType != "identity.admin_invited" {
		return ErrInvalidIntake
	}
	if in.TemplateData.AdminUserID != "" && !validUUID(in.TemplateData.AdminUserID) {
		return ErrInvalidIntake
	}
	return nil
}

type Message struct {
	ID                string
	SourceEventID     string
	TemplateKey       string
	RecipientEmail    *string
	TemplateData      TemplateData
	Status            string
	Provider          string
	ProviderMessageID *string
	Attempts          int32
	LastError         *string
	SentAt            *time.Time
	CreatedAt         time.Time
	UpdatedAt         time.Time
}

// Repository.Intake records local intake, not delivery completion. A retry must
// inspect the returned status and send pending/failed messages using the same ID.
// A processed_events row alone must never cause a pending dispatch to be skipped.
type Repository interface {
	Intake(context.Context, Intake, time.Time) (Message, error)
	IsSuppressed(context.Context, string) (bool, error)
	Suppress(context.Context, string, string, *string, time.Time) error
	Cleanup(context.Context, time.Time, int32) error
}
