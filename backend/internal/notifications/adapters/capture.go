package adapters

import (
	"context"
	"errors"
	"sync"

	"github.com/freedomCruz/monte-luna/backend/internal/notifications/domain"
)

// CaptureSender is development/test-only. Contents, including one-time links,
// stay exclusively in this instance's memory and vanish with the process.
type CaptureSender struct {
	mu       sync.Mutex
	messages []domain.Email
	seen     map[string]struct{}
}

var _ domain.EmailSender = (*CaptureSender)(nil)

func NewCaptureSender() *CaptureSender { return &CaptureSender{seen: make(map[string]struct{})} }
func (c *CaptureSender) Send(ctx context.Context, email domain.Email) (domain.SendResult, error) {
	if err := ctx.Err(); err != nil {
		return domain.SendResult{}, err
	}
	if email.MessageID == "" || !domain.ValidEmail(email.Recipient) || email.HTML == "" || email.Text == "" {
		return domain.SendResult{}, errors.New("invalid local email")
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	if _, exists := c.seen[email.MessageID]; !exists {
		c.messages = append(c.messages, email)
		c.seen[email.MessageID] = struct{}{}
	}
	return domain.SendResult{Provider: "capture", MessageID: "capture_" + email.MessageID}, nil
}
func (c *CaptureSender) Messages() []domain.Email {
	c.mu.Lock()
	defer c.mu.Unlock()
	return append([]domain.Email(nil), c.messages...)
}
