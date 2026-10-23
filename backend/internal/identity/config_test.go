package identity_test

import (
	"encoding/base64"
	"strings"
	"testing"

	"github.com/freedomCruz/monte-luna/backend/internal/identity"
)

func environment(values map[string]string) func(string) string {
	return func(name string) string { return values[name] }
}

func TestLoadConfigValidatesWithoutEchoingValues(t *testing.T) {
	valid := base64.StdEncoding.EncodeToString([]byte(strings.Repeat("k", 32)))
	for _, tc := range []struct{ name, key, base, want string }{
		{"missing key", "", "https://store.test", "APP_ENCRYPTION_KEY is required"},
		{"malformed key", "not base64 secret!", "https://store.test", "APP_ENCRYPTION_KEY must be standard base64 encoding exactly 32 bytes"},
		{"url-safe alphabet", base64.URLEncoding.EncodeToString([]byte(strings.Repeat("\xff", 32))), "https://store.test", "APP_ENCRYPTION_KEY must be standard base64 encoding exactly 32 bytes"},
		{"short key", base64.StdEncoding.EncodeToString([]byte(strings.Repeat("k", 31))), "https://store.test", "APP_ENCRYPTION_KEY must be standard base64 encoding exactly 32 bytes"},
		{"long key", base64.StdEncoding.EncodeToString([]byte(strings.Repeat("k", 33))), "https://store.test", "APP_ENCRYPTION_KEY must be standard base64 encoding exactly 32 bytes"},
		{"missing base", valid, "", "STOREFRONT_BASE_URL is required"},
		{"relative base", valid, "store.test/secret-path", "STOREFRONT_BASE_URL must be an absolute HTTP(S) origin without credentials, path, query or fragment"},
		{"base with path", valid, "https://store.test/secret-path", "STOREFRONT_BASE_URL must be an absolute HTTP(S) origin without credentials, path, query or fragment"},
		{"base with credentials", valid, "https://user:secret-pass@store.test", "STOREFRONT_BASE_URL must be an absolute HTTP(S) origin without credentials, path, query or fragment"},
		{"base with query", valid, "https://store.test?secret-q=1", "STOREFRONT_BASE_URL must be an absolute HTTP(S) origin without credentials, path, query or fragment"},
		{"ftp base", valid, "ftp://store.test", "STOREFRONT_BASE_URL must be an absolute HTTP(S) origin without credentials, path, query or fragment"},
		{"https origin", valid, "https://store.test/", ""},
		{"local http origin", valid, "http://127.0.0.1:19000", ""},
	} {
		t.Run(tc.name, func(t *testing.T) {
			cfg, err := identity.LoadConfig(environment(map[string]string{"APP_ENCRYPTION_KEY": tc.key, "STOREFRONT_BASE_URL": tc.base}))
			if tc.want == "" {
				if err != nil || len(cfg.EncryptionKey) != 32 || strings.HasSuffix(cfg.StorefrontBaseURL, "/") {
					t.Fatalf("valid configuration rejected: %v", err)
				}
				return
			}
			if err == nil || err.Error() != tc.want {
				t.Fatalf("error=%v want %s", err, tc.want)
			}
			for _, secret := range []string{tc.key, "secret"} {
				if secret != "" && strings.Contains(err.Error(), secret) {
					t.Fatal("startup error echoes a configuration value")
				}
			}
		})
	}
}

func TestApprovedSecurityPolicyConstants(t *testing.T) {
	got := []any{identity.SessionLifetime.String(), identity.SessionIdleTimeout.String(), identity.PendingSessionLifetime.String(), identity.LockoutThreshold, identity.LockoutDuration.String(), identity.AccountAttemptsPerMin, identity.AccountBurst, identity.IPAttemptsPerMin, identity.IPBurst, identity.LimiterMaxKeys, identity.LimiterIdleEviction.String(), identity.RecoveryCodeCount, identity.RecoveryCodeBytes, identity.PasswordMinLength, identity.PasswordMaxLength}
	want := []any{"12h0m0s", "30m0s", "10m0s", 5, "15m0s", 5, 5, 20, 20, 10000, "15m0s", 10, 10, 12, 128}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("policy value %d = %v want %v", i, got[i], want[i])
		}
	}
}
