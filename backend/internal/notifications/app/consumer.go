// Package app consumes Identity events without retaining decrypted credentials.
package app

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	"github.com/freedomCruz/monte-luna/backend/internal/notifications/domain"
)

var (
	ErrInvalidEvent = errors.New("invalid notification event")
	ErrDelivery     = errors.New("notification delivery failed")
	ErrPersistence  = errors.New("notification persistence failed")
)

type Consumer struct {
	store     domain.DeliveryRepository
	renderer  domain.Renderer
	sender    domain.EmailSender
	decryptor domain.TokenDecryptor
	links     domain.LinkBuilder
	now       func() time.Time
}

func NewConsumer(store domain.DeliveryRepository, renderer domain.Renderer, sender domain.EmailSender, decryptor domain.TokenDecryptor, links domain.LinkBuilder, now func() time.Time) *Consumer {
	return &Consumer{store: store, renderer: renderer, sender: sender, decryptor: decryptor, links: links, now: now}
}

func (c *Consumer) Handle(ctx context.Context, event domain.Event) error {
	if c.store == nil || c.renderer == nil || c.sender == nil || c.decryptor == nil || c.links == nil || c.now == nil {
		return errors.New("notification consumer is not configured")
	}
	key := ""
	switch event.Type {
	case "identity.password_reset_requested":
		key = "password_reset"
	case "identity.admin_invited":
		key = "admin_invitation"
	default:
		return ErrInvalidEvent
	}
	// Decode only the approved fields; never hand the entire outbox payload to storage.
	var payload struct {
		AdminUserID    string `json:"admin_user_id"`
		Email          string `json:"email"`
		DisplayName    string `json:"display_name"`
		EncryptedToken string `json:"raw_token_encrypted"`
		Role           string `json:"role"`
	}
	if err := json.Unmarshal(event.Payload, &payload); err != nil {
		return ErrInvalidEvent
	}
	input := domain.Intake{SourceEventID: event.ID, EventType: event.Type, TemplateKey: key, RecipientEmail: payload.Email, TemplateData: domain.TemplateData{AdminUserID: payload.AdminUserID, DisplayName: payload.DisplayName}}
	if input.Validate() != nil || payload.AdminUserID == "" || payload.EncryptedToken == "" || (key == "admin_invitation" && payload.Role != "owner" && payload.Role != "staff") {
		return ErrInvalidEvent
	}
	message, err := c.store.Intake(ctx, input, c.now())
	if err != nil {
		return ErrPersistence
	}
	if message.Status != "pending" && message.Status != "failed" {
		return nil
	}
	fail := func() error {
		// The original error may contain tokens, provider bodies or a complete URL.
		// Persist only a fixed classification and never return the original error.
		if err := c.store.RecordFailure(ctx, message.ID, c.now()); err != nil {
			return ErrPersistence
		}
		return ErrDelivery
	}
	if message.RecipientEmail == nil {
		return fail()
	}
	token, err := c.decryptor.Decrypt(ctx, payload.AdminUserID, payload.EncryptedToken)
	if err != nil || token == "" {
		return fail()
	}
	link, err := c.links.Build(ctx, event.Type, token)
	if err != nil {
		return fail()
	}
	email, err := c.renderer.Render(ctx, message.TemplateKey, domain.TemplateView{DisplayName: message.TemplateData.DisplayName, Role: payload.Role, ActionURL: link})
	if err != nil {
		return fail()
	}
	email.MessageID = message.ID
	email.Recipient = *message.RecipientEmail
	// Close the suppression window across decryption/rendering as far as possible
	// before provider I/O; the repository rechecks on every future retry as well.
	suppressed, err := c.store.IsSuppressed(ctx, email.Recipient)
	if err != nil {
		return ErrPersistence
	}
	if suppressed {
		_, err := c.store.Intake(ctx, input, c.now())
		if err != nil {
			return ErrPersistence
		}
		return nil
	}
	result, err := c.sender.Send(ctx, email)
	if err != nil || result.Provider == "" || result.MessageID == "" {
		return fail()
	}
	if err := c.store.RecordSent(ctx, message.ID, result, c.now()); err != nil {
		return ErrPersistence
	}
	return nil
}
