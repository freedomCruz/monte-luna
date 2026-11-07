package main

import (
	"encoding/base64"
	"strings"
	"testing"
)

func TestAPIMediaConfiguration(t *testing.T) {
	paymentEnvironment(t)
	t.Setenv("API_ADDR", "127.0.0.1:8080")
	t.Setenv("DATABASE_URL", "postgres://demo:demo@localhost/demo")
	t.Setenv("MEDIA_BASE_URL", "https://media.example/")
	t.Setenv("TRACKING_TOKEN_SECRET", base64.StdEncoding.EncodeToString([]byte(strings.Repeat("s", 32))))
	t.Setenv("ORDER_MAINTENANCE_INTERVAL", "")
	t.Setenv("MEDIA_STORAGE", "")
	for _, key := range []string{"R2_ENDPOINT", "R2_BUCKET", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY"} {
		t.Setenv(key, "")
	}
	cfg, err := loadConfig()
	if err != nil || cfg.media.Storage != "disabled" {
		t.Fatalf("disabled: %v", err)
	}
	t.Setenv("MEDIA_STORAGE", "r2")
	if _, err := loadConfig(); err == nil || err.Error() != "R2_ENDPOINT is required when MEDIA_STORAGE is r2" {
		t.Fatalf("missing R2: %v", err)
	}
}
