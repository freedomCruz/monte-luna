package identity

import (
	"encoding/base64"
	"errors"
	"net/url"
	"strings"
	"time"
)

// Approved security policy values (docs/domain/identity.md, section 2). They
// are code constants, not environment settings.
const (
	SessionLifetime        = 12 * time.Hour
	SessionIdleTimeout     = 30 * time.Minute
	PendingSessionLifetime = 10 * time.Minute
	LockoutThreshold       = 5
	LockoutDuration        = 15 * time.Minute
	AccountAttemptsPerMin  = 5
	AccountBurst           = 5
	IPAttemptsPerMin       = 20
	IPBurst                = 20
	LimiterMaxKeys         = 10000
	LimiterIdleEviction    = 15 * time.Minute
	RecoveryCodeCount      = 10
	RecoveryCodeBytes      = 10
	PasswordMinLength      = 12
	PasswordMaxLength      = 128
	// MaintenanceBatch bounds each cleanup statement per scheduled run.
	MaintenanceBatch = 1000
)

// Config holds validated environment settings. Startup errors name the
// variable and never echo its value.
type Config struct {
	EncryptionKey     []byte
	StorefrontBaseURL string
}

func LoadConfig(getenv func(string) string) (Config, error) {
	raw := getenv("APP_ENCRYPTION_KEY")
	if raw == "" {
		return Config{}, errors.New("APP_ENCRYPTION_KEY is required")
	}
	key, err := base64.StdEncoding.Strict().DecodeString(raw)
	if err != nil || len(key) != 32 {
		return Config{}, errors.New("APP_ENCRYPTION_KEY must be standard base64 encoding exactly 32 bytes")
	}
	base := strings.TrimRight(getenv("STOREFRONT_BASE_URL"), "/")
	if strings.TrimSpace(base) == "" {
		return Config{}, errors.New("STOREFRONT_BASE_URL is required")
	}
	if !validOrigin(base) {
		return Config{}, errors.New("STOREFRONT_BASE_URL must be an absolute HTTP(S) origin without credentials, path, query or fragment")
	}
	return Config{EncryptionKey: key, StorefrontBaseURL: base}, nil
}

func (c Config) Validate() error {
	if len(c.EncryptionKey) != 32 {
		return errors.New("APP_ENCRYPTION_KEY must be standard base64 encoding exactly 32 bytes")
	}
	if !validOrigin(c.StorefrontBaseURL) {
		return errors.New("STOREFRONT_BASE_URL must be an absolute HTTP(S) origin without credentials, path, query or fragment")
	}
	return nil
}

func validOrigin(value string) bool {
	u, err := url.Parse(value)
	return err == nil && u.Host != "" && (u.Scheme == "https" || u.Scheme == "http") && u.User == nil && u.Path == "" && u.RawQuery == "" && u.Fragment == "" && !u.ForceQuery && u.Opaque == ""
}
