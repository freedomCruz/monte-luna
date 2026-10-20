package domain

import (
	"context"
	"errors"
	"time"
)

var ErrMessageNotFound = errors.New("notification message not found")
var ErrInvalidWebhook = errors.New("invalid notification webhook")

type ProviderEvent struct {
	ExternalID, Type, ProviderMessageID, BounceType string
	Recipients                                      []string
}
type WebhookRepository interface {
	ProcessWebhook(context.Context, ProviderEvent, time.Time) error
}

func (e ProviderEvent) Validate() error {
	if e.ExternalID == "" || e.ProviderMessageID == "" || len(e.Recipients) == 0 {
		return ErrInvalidWebhook
	}
	switch e.Type {
	case "email.delivered", "email.complained":
	case "email.bounced":
		if e.BounceType == "" {
			return ErrInvalidWebhook
		}
	default:
		return ErrInvalidWebhook
	}
	for _, email := range e.Recipients {
		if !ValidEmail(email) {
			return ErrInvalidWebhook
		}
	}
	return nil
}
func (e ProviderEvent) SuppressionReason() string {
	if e.Type == "email.complained" {
		return "complaint"
	}
	if e.Type == "email.bounced" && e.BounceType == "Permanent" {
		return "hard_bounce"
	}
	return ""
}

// WebhookStatus is monotonic under out-of-order provider events. Suppression
// effects are independent: late permanent bounces still add their addresses.
func WebhookStatus(current, eventType string) string {
	if current == "complained" || current == "suppressed" {
		return current
	}
	switch eventType {
	case "email.complained":
		return "complained"
	case "email.bounced":
		return "bounced"
	case "email.delivered":
		if current != "bounced" {
			return "delivered"
		}
	}
	return current
}
