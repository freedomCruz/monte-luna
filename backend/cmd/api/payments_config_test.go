package main

import (
	"encoding/base64"
	"strings"
	"testing"
)

func paymentEnvironment(t *testing.T) {
	t.Helper()
	// Keep startup tests hermetic: a developer shell may select the Resend sender.
	t.Setenv("NOTIFICATIONS_EMAIL_SENDER", "")
	for key, value := range map[string]string{"WOMPI_PUBLIC_KEY": "pub_test_fixture", "WOMPI_PRIVATE_KEY": "prv_test_fixture", "WOMPI_INTEGRITY_SECRET": "fixture-integrity", "WOMPI_EVENTS_SECRET": "fixture-events", "WOMPI_ENVIRONMENT": "sandbox", "STOREFRONT_BASE_URL": "https://store.test"} {
		t.Setenv(key, value)
	}
}
func TestPaymentsStartupConfiguration(t *testing.T) {
	paymentEnvironment(t)
	t.Setenv("API_ADDR", "127.0.0.1:8080")
	t.Setenv("DATABASE_URL", "postgres://demo:demo@localhost/demo")
	t.Setenv("MEDIA_BASE_URL", "https://media.example/")
	t.Setenv("TRACKING_TOKEN_SECRET", base64.StdEncoding.EncodeToString([]byte(strings.Repeat("s", 32))))
	for _, name := range []string{"WOMPI_PUBLIC_KEY", "WOMPI_PRIVATE_KEY", "WOMPI_INTEGRITY_SECRET", "WOMPI_EVENTS_SECRET", "WOMPI_ENVIRONMENT", "STOREFRONT_BASE_URL"} {
		t.Run(name, func(t *testing.T) {
			t.Setenv(name, "")
			if _, err := loadConfig(); err == nil || err.Error() != name+" is required" {
				t.Fatalf("missing configuration: %v", err)
			}
		})
	}
}
