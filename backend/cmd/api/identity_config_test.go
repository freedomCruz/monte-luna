package main

import (
	"encoding/base64"
	"slices"
	"strings"
	"testing"
)

func TestIdentityStartupConfiguration(t *testing.T) {
	paymentEnvironment(t)
	t.Setenv("API_ADDR", "127.0.0.1:8080")
	t.Setenv("DATABASE_URL", "postgres://demo:demo@localhost/demo")
	t.Setenv("MEDIA_BASE_URL", "https://media.example/")
	t.Setenv("TRACKING_TOKEN_SECRET", base64.StdEncoding.EncodeToString([]byte(strings.Repeat("s", 32))))
	for _, tc := range []struct{ name, key, want string }{
		{"missing key", "", "APP_ENCRYPTION_KEY is required"},
		{"malformed key", "secret-not-base64!", "APP_ENCRYPTION_KEY must be standard base64 encoding exactly 32 bytes"},
		{"short key", base64.StdEncoding.EncodeToString([]byte(strings.Repeat("k", 16))), "APP_ENCRYPTION_KEY must be standard base64 encoding exactly 32 bytes"},
		{"valid key", base64.StdEncoding.EncodeToString([]byte(strings.Repeat("k", 32))), ""},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Setenv("APP_ENCRYPTION_KEY", tc.key)
			cfg, err := loadConfig()
			if tc.want == "" {
				if err != nil || len(cfg.identity.EncryptionKey) != 32 || cfg.identity.StorefrontBaseURL != "https://store.test" {
					t.Fatalf("valid identity configuration rejected: %v", err)
				}
				return
			}
			if err == nil || err.Error() != tc.want || (tc.key != "" && strings.Contains(err.Error(), tc.key)) {
				t.Fatalf("error=%v want %s", err, tc.want)
			}
		})
	}
}

func TestRelayIncludesIdentityOutbox(t *testing.T) {
	if !slices.Equal(outboxSchemas, []string{"catalog", "orders", "payments", "identity"}) {
		t.Fatalf("relay schemas %v", outboxSchemas)
	}
}
