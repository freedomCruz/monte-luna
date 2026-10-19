package payments

import (
	"context"
	"time"
)

// Cleanup runs one bounded webhook-ledger cleanup with the configured retention.
func (m *Module) Cleanup(ctx context.Context, now time.Time) error {
	retention := m.config.WebhookRetention
	if retention <= 0 {
		retention = 30 * 24 * time.Hour
	}
	return m.repository.CleanupWebhooks(ctx, now, retention, 100)
}

// RunJobs must be joined before Close; it never starts its own goroutines.
func (m *Module) RunJobs(ctx context.Context, interval time.Duration) {
	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case now := <-ticker.C:
			if err := m.Cleanup(ctx, now); err != nil && ctx.Err() == nil {
				m.logger.Error("payment webhook cleanup failed")
			}
		}
	}
}
