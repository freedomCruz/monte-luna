package platform

import (
	"fmt"
	"strconv"
	"time"
)

// LoadRelayConfig reads explicit overrides without exposing configuration values
// in errors. Empty values retain the canonical defaults.
func LoadRelayConfig(getenv func(string) string) (RelayConfig, error) {
	cfg := DefaultRelayConfig()
	for _, entry := range []struct {
		name   string
		target *time.Duration
	}{{"OUTBOX_POLL_INTERVAL", &cfg.PollInterval}, {"OUTBOX_CLEANUP_INTERVAL", &cfg.CleanupInterval}, {"OUTBOX_RETENTION", &cfg.Retention}, {"OUTBOX_INITIAL_BACKOFF", &cfg.InitialBackoff}, {"OUTBOX_MAX_BACKOFF", &cfg.MaxBackoff}} {
		if value := getenv(entry.name); value != "" {
			parsed, err := time.ParseDuration(value)
			if err != nil || parsed <= 0 {
				return cfg, fmt.Errorf("%s must be a positive duration", entry.name)
			}
			*entry.target = parsed
		}
	}
	for _, entry := range []struct {
		name   string
		target *int
	}{{"OUTBOX_BATCH_SIZE", &cfg.BatchSize}, {"OUTBOX_MAX_ATTEMPTS", &cfg.MaxAttempts}} {
		if value := getenv(entry.name); value != "" {
			parsed, err := strconv.Atoi(value)
			if err != nil || parsed <= 0 {
				return cfg, fmt.Errorf("%s must be a positive integer", entry.name)
			}
			*entry.target = parsed
		}
	}
	return cfg, cfg.Validate()
}
