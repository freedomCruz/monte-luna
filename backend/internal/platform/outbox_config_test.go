package platform_test

import (
	"testing"
	"time"

	"github.com/freedomCruz/monte-luna/backend/internal/platform"
)

func TestRelayEnvironment(t *testing.T) {
	names := []string{"OUTBOX_POLL_INTERVAL", "OUTBOX_CLEANUP_INTERVAL", "OUTBOX_RETENTION", "OUTBOX_BATCH_SIZE", "OUTBOX_MAX_ATTEMPTS", "OUTBOX_INITIAL_BACKOFF", "OUTBOX_MAX_BACKOFF"}
	values := map[string]string{"OUTBOX_POLL_INTERVAL": "2s", "OUTBOX_CLEANUP_INTERVAL": "2h", "OUTBOX_RETENTION": "48h", "OUTBOX_BATCH_SIZE": "7", "OUTBOX_MAX_ATTEMPTS": "3", "OUTBOX_INITIAL_BACKOFF": "4s", "OUTBOX_MAX_BACKOFF": "1m"}
	cfg, err := platform.LoadRelayConfig(func(key string) string { return values[key] })
	if err != nil {
		t.Fatal(err)
	}
	if cfg.PollInterval != 2*time.Second || cfg.BatchSize != 7 || cfg.MaxAttempts != 3 || cfg.InitialBackoff != 4*time.Second || cfg.MaxBackoff != time.Minute || cfg.Retention != 48*time.Hour || cfg.CleanupInterval != 2*time.Hour {
		t.Fatalf("ignored environment: %+v", cfg)
	}
	for _, name := range names {
		t.Run(name, func(t *testing.T) {
			if _, err := platform.LoadRelayConfig(func(key string) string {
				if key == name {
					return "invalid"
				}
				return ""
			}); err == nil {
				t.Fatal("malformed config accepted")
			}
		})
	}
}
