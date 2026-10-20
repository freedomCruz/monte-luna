package main

import (
	"encoding/base64"
	"strings"
	"testing"
	"time"
)

func TestNotificationsStartupConfiguration(t *testing.T) {
	paymentEnvironment(t)
	t.Setenv("API_ADDR", "127.0.0.1:8080")
	t.Setenv("DATABASE_URL", "postgres://demo:demo@localhost/demo")
	t.Setenv("MEDIA_BASE_URL", "https://media.example/")
	t.Setenv("TRACKING_TOKEN_SECRET", base64.StdEncoding.EncodeToString([]byte(strings.Repeat("s", 32))))
	for _, tc := range []struct{ name, sender, apiKey, want string }{
		{"capture default", "", "", ""},
		{"resend complete", "resend", "re_fixture", ""},
		{"resend missing key", "resend", "", "RESEND_API_KEY is required when NOTIFICATIONS_EMAIL_SENDER is resend"},
		{"invalid sender", "smtp", "", "NOTIFICATIONS_EMAIL_SENDER must be capture or resend"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Setenv("NOTIFICATIONS_EMAIL_SENDER", tc.sender)
			t.Setenv("RESEND_API_KEY", tc.apiKey)
			t.Setenv("RESEND_FROM", "no-reply@mail.example.test")
			t.Setenv("RESEND_WEBHOOK_SECRET", "whsec_Zml4dHVyZQ==")
			cfg, err := loadConfig()
			if tc.want != "" {
				if err == nil || err.Error() != tc.want {
					t.Fatalf("error=%v want %s", err, tc.want)
				}
				return
			}
			if err != nil {
				t.Fatal(err)
			}
			if want := map[string]string{"": "capture", "resend": "resend"}[tc.sender]; cfg.notifications.Sender != want || cfg.notifications.CleanupInterval != time.Hour {
				t.Fatalf("sender=%q interval=%s", cfg.notifications.Sender, cfg.notifications.CleanupInterval)
			}
		})
	}
}
