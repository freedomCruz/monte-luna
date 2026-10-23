package domain

import (
	"context"
	"time"
)

// Event contains the durable ciphertext envelope; plaintext exists only during Handle.
type Event struct {
	ID, Type string
	Payload  []byte
}

// TemplateView is ephemeral and must never be passed to a persistence adapter.
type TemplateView struct{ DisplayName, Role, ActionURL string }

// Email holds rendered secret-bearing content only for the duration of delivery
// or in a process-local capture. It must never be persisted or logged.
type Email struct{ MessageID, Recipient, Subject, HTML, Text string }
type SendResult struct{ Provider, MessageID string }

type Renderer interface {
	Render(context.Context, string, TemplateView) (Email, error)
}
type EmailSender interface {
	Send(context.Context, Email) (SendResult, error)
}
type TokenDecryptor interface {
	Decrypt(context.Context, string) (string, error)
}

// LinkBuilder owns approved Identity routing. Consumers never guess token URLs.
type LinkBuilder interface {
	Build(context.Context, string, string) (string, error)
}

// DeliveryRepository records only safe metadata, never Email or TemplateView.
type DeliveryRepository interface {
	Intake(context.Context, Intake, time.Time) (Message, error)
	IsSuppressed(context.Context, string) (bool, error)
	RecordSent(context.Context, string, SendResult, time.Time) error
	RecordFailure(context.Context, string, time.Time) error
}
