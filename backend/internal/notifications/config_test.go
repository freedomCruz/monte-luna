package notifications_test

import (
	"strings"
	"testing"
	"time"

	"github.com/freedomCruz/monte-luna/backend/internal/notifications"
)

const (
	fakeAPIKey = "re_fixture_key_value"
	fakeFrom   = "Monteluna <no-reply@mail.example.test>"
	fakeSecret = "whsec_Zml4dHVyZS1zaWduaW5nLXNlY3JldA=="
)

func environment(values map[string]string) func(string) string {
	return func(name string) string { return values[name] }
}

func resendEnvironment() map[string]string {
	return map[string]string{"NOTIFICATIONS_EMAIL_SENDER": "resend", "RESEND_API_KEY": fakeAPIKey, "RESEND_FROM": fakeFrom, "RESEND_WEBHOOK_SECRET": fakeSecret}
}

func TestLoadConfigSelectsSender(t *testing.T) {
	for _, tt := range []struct {
		name   string
		values map[string]string
		sender string
	}{
		{"capture by default", map[string]string{}, "capture"},
		{"explicit capture", map[string]string{"NOTIFICATIONS_EMAIL_SENDER": "capture"}, "capture"},
		{"capture ignores resend variables", map[string]string{"NOTIFICATIONS_EMAIL_SENDER": "capture", "RESEND_API_KEY": fakeAPIKey}, "capture"},
		{"resend complete", resendEnvironment(), "resend"},
	} {
		t.Run(tt.name, func(t *testing.T) {
			cfg, err := notifications.LoadConfig(environment(tt.values))
			if err != nil {
				t.Fatal(err)
			}
			if cfg.Sender != tt.sender {
				t.Fatalf("sender=%q want %q", cfg.Sender, tt.sender)
			}
			if cfg.CleanupInterval != time.Hour {
				t.Fatalf("cleanup interval=%s want 1h", cfg.CleanupInterval)
			}
			if tt.sender == "resend" && (cfg.ResendAPIKey != fakeAPIKey || cfg.ResendFrom != fakeFrom || cfg.ResendWebhookSecret != fakeSecret || cfg.HTTPTimeout <= 0) {
				t.Fatal("resend configuration was not loaded with a positive HTTP timeout")
			}
			if tt.sender == "capture" && (cfg.ResendAPIKey != "" || cfg.ResendFrom != "" || cfg.ResendWebhookSecret != "") {
				t.Fatal("capture configuration retained resend credentials")
			}
		})
	}
}

func TestLoadConfigRejectsInvalidSenderConfiguration(t *testing.T) {
	type change struct{ name, value string }
	for _, tt := range []struct {
		name    string
		changes []change
		want    string
	}{
		{"missing api key", []change{{"RESEND_API_KEY", ""}}, "RESEND_API_KEY is required when NOTIFICATIONS_EMAIL_SENDER is resend"},
		{"blank api key", []change{{"RESEND_API_KEY", "  "}}, "RESEND_API_KEY is required when NOTIFICATIONS_EMAIL_SENDER is resend"},
		{"missing from", []change{{"RESEND_FROM", ""}}, "RESEND_FROM is required when NOTIFICATIONS_EMAIL_SENDER is resend"},
		{"missing webhook secret", []change{{"RESEND_WEBHOOK_SECRET", ""}}, "RESEND_WEBHOOK_SECRET is required when NOTIFICATIONS_EMAIL_SENDER is resend"},
		{"api key with whitespace", []change{{"RESEND_API_KEY", "re_bad key"}}, "RESEND_API_KEY must not contain whitespace"},
		{"invalid from", []change{{"RESEND_FROM", "not-an-address"}}, "RESEND_FROM must be a valid email address"},
		{"invalid webhook secret", []change{{"RESEND_WEBHOOK_SECRET", "whsec_%%%"}}, "RESEND_WEBHOOK_SECRET must be a base64 signing secret"},
		{"invalid sender", []change{{"NOTIFICATIONS_EMAIL_SENDER", "smtp-relay"}}, "NOTIFICATIONS_EMAIL_SENDER must be capture or resend"},
		{"sender case", []change{{"NOTIFICATIONS_EMAIL_SENDER", "Resend"}}, "NOTIFICATIONS_EMAIL_SENDER must be capture or resend"},
	} {
		t.Run(tt.name, func(t *testing.T) {
			values := resendEnvironment()
			for _, c := range tt.changes {
				values[c.name] = c.value
			}
			_, err := notifications.LoadConfig(environment(values))
			if err == nil || err.Error() != tt.want {
				t.Fatalf("error=%v want %s", err, tt.want)
			}
			for _, value := range values {
				if strings.TrimSpace(value) != "" && strings.Contains(err.Error(), value) && value != "resend" {
					t.Fatal("configuration error echoed an environment value")
				}
			}
		})
	}
}
