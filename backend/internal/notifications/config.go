package notifications

import (
	"encoding/base64"
	"fmt"
	"net/mail"
	"strings"
	"time"
)

const (
	SenderCapture = "capture"
	SenderResend  = "resend"
)

// Config selects the email sender. Capture needs no domain, DNS records or public
// webhook URL; Resend is selected only explicitly and requires all credentials.
type Config struct {
	Sender                                        string
	ResendAPIKey, ResendFrom, ResendWebhookSecret string
	HTTPTimeout                                   time.Duration
	CleanupInterval                               time.Duration
}

// LoadConfig validates startup configuration. Errors name the variable and never
// include its value, because Resend variables hold credentials.
func LoadConfig(getenv func(string) string) (Config, error) {
	cfg := Config{Sender: getenv("NOTIFICATIONS_EMAIL_SENDER"), CleanupInterval: time.Hour}
	switch cfg.Sender {
	case "", SenderCapture:
		cfg.Sender = SenderCapture
		return cfg, nil
	case SenderResend:
	default:
		return Config{}, fmt.Errorf("NOTIFICATIONS_EMAIL_SENDER must be %s or %s", SenderCapture, SenderResend)
	}
	cfg.ResendAPIKey, cfg.ResendFrom, cfg.ResendWebhookSecret = getenv("RESEND_API_KEY"), getenv("RESEND_FROM"), getenv("RESEND_WEBHOOK_SECRET")
	cfg.HTTPTimeout = 10 * time.Second
	return cfg, cfg.Validate()
}

func (c Config) Validate() error {
	switch c.Sender {
	case SenderCapture:
		return nil
	case SenderResend:
	default:
		return fmt.Errorf("NOTIFICATIONS_EMAIL_SENDER must be %s or %s", SenderCapture, SenderResend)
	}
	for _, entry := range []struct{ name, value string }{{"RESEND_API_KEY", c.ResendAPIKey}, {"RESEND_FROM", c.ResendFrom}, {"RESEND_WEBHOOK_SECRET", c.ResendWebhookSecret}} {
		if strings.TrimSpace(entry.value) == "" {
			return fmt.Errorf("%s is required when NOTIFICATIONS_EMAIL_SENDER is resend", entry.name)
		}
	}
	if strings.ContainsAny(c.ResendAPIKey, " \t\r\n") {
		return fmt.Errorf("RESEND_API_KEY must not contain whitespace")
	}
	if _, err := mail.ParseAddress(c.ResendFrom); err != nil || strings.ContainsAny(c.ResendFrom, "\r\n") {
		return fmt.Errorf("RESEND_FROM must be a valid email address")
	}
	if key, err := base64.StdEncoding.DecodeString(strings.TrimPrefix(c.ResendWebhookSecret, "whsec_")); err != nil || len(key) == 0 {
		return fmt.Errorf("RESEND_WEBHOOK_SECRET must be a base64 signing secret")
	}
	if c.HTTPTimeout <= 0 {
		return fmt.Errorf("notifications Resend HTTP timeout must be positive")
	}
	return nil
}
