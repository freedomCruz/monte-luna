package adapters

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"net/url"
	"strings"
	"time"
)

type Config struct {
	PublicKey, PrivateKey, IntegritySecret, EventsSecret, Environment, StorefrontBaseURL string
	HTTPTimeout                                                                          time.Duration
	WebhookRetention                                                                     time.Duration
}

func LoadConfig(getenv func(string) string) (Config, error) {
	cfg := Config{PublicKey: getenv("WOMPI_PUBLIC_KEY"), PrivateKey: getenv("WOMPI_PRIVATE_KEY"), IntegritySecret: getenv("WOMPI_INTEGRITY_SECRET"), EventsSecret: getenv("WOMPI_EVENTS_SECRET"), Environment: getenv("WOMPI_ENVIRONMENT"), StorefrontBaseURL: strings.TrimRight(getenv("STOREFRONT_BASE_URL"), "/"), HTTPTimeout: 10 * time.Second}
	cfg.WebhookRetention = 30 * 24 * time.Hour
	if value := getenv("PAYMENT_WEBHOOK_RETENTION"); value != "" {
		parsed, err := time.ParseDuration(value)
		if err != nil || parsed <= 0 {
			return cfg, fmt.Errorf("PAYMENT_WEBHOOK_RETENTION must be a positive duration")
		}
		cfg.WebhookRetention = parsed
	}
	return cfg, cfg.Validate()
}
func (c Config) Validate() error {
	for _, entry := range []struct{ name, value string }{{"WOMPI_PUBLIC_KEY", c.PublicKey}, {"WOMPI_PRIVATE_KEY", c.PrivateKey}, {"WOMPI_INTEGRITY_SECRET", c.IntegritySecret}, {"WOMPI_EVENTS_SECRET", c.EventsSecret}, {"WOMPI_ENVIRONMENT", c.Environment}, {"STOREFRONT_BASE_URL", c.StorefrontBaseURL}} {
		if strings.TrimSpace(entry.value) == "" {
			return fmt.Errorf("%s is required", entry.name)
		}
	}
	if c.Environment != "sandbox" && c.Environment != "production" {
		return fmt.Errorf("WOMPI_ENVIRONMENT must be sandbox or production")
	}
	u, err := url.Parse(c.StorefrontBaseURL)
	if err != nil || u.Host == "" || (u.Scheme != "https" && u.Scheme != "http") || u.User != nil || u.RawQuery != "" || u.Fragment != "" || u.Path != "" {
		return fmt.Errorf("STOREFRONT_BASE_URL must be an absolute HTTP(S) origin without credentials, path, query or fragment")
	}
	return nil
}
func (c Config) GatewayURL() string {
	if c.Environment == "production" {
		return "https://production.wompi.co"
	}
	return "https://sandbox.wompi.co"
}

type SystemClock struct{}

func (SystemClock) Now() time.Time { return time.Now() }

type RandomReferences struct{}

func (RandomReferences) Reference() (string, error) {
	var b [24]byte
	if _, err := rand.Read(b[:]); err != nil {
		return "", fmt.Errorf("generate payment reference: %w", err)
	}
	return "REF" + hex.EncodeToString(b[:]), nil
}
