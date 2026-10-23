package postgres

import (
	"context"
	"errors"
	"fmt"
	"sort"
	"strings"
	"time"

	notificationssql "github.com/freedomCruz/monte-luna/backend/internal/notifications/adapters/postgres/sqlc"
	"github.com/freedomCruz/monte-luna/backend/internal/notifications/domain"
	"github.com/jackc/pgx/v5"
)

var _ domain.WebhookRepository = (*Repository)(nil)

// ProcessWebhook atomically records the provider event, monotonic delivery state
// and all permanent suppressions. Unknown messages and persistence failures roll
// back the deduplication claim so Resend can recover the send/webhook race.
func (r *Repository) ProcessWebhook(ctx context.Context, event domain.ProviderEvent, received time.Time) error {
	if err := event.Validate(); err != nil {
		return err
	}
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin notification webhook: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()
	q := notificationssql.New(tx)
	inserted, err := q.RecordWebhook(ctx, notificationssql.RecordWebhookParams{ExternalEventID: event.ExternalID, EventType: event.Type, ReceivedAt: stamp(received)})
	if err != nil {
		return fmt.Errorf("claim notification webhook: %w", err)
	}
	if inserted == 0 {
		return nil
	}
	message, err := q.LockMessageByProvider(ctx, &event.ProviderMessageID)
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.ErrMessageNotFound
	}
	if err != nil {
		return fmt.Errorf("match notification webhook: %w", err)
	}
	status := domain.WebhookStatus(message.Status, event.Type)
	if status != message.Status {
		if err := q.UpdateWebhookStatus(ctx, notificationssql.UpdateWebhookStatusParams{ID: message.ID, Status: status, UpdatedAt: stamp(received)}); err != nil {
			return fmt.Errorf("update notification delivery state: %w", err)
		}
	}
	if reason := event.SuppressionReason(); reason != "" {
		// Deterministic lock order also protects distinct messages that share impacted
		// recipients. Duplicate/case-variant addresses never cause duplicate writes.
		unique := make(map[string]struct{}, len(event.Recipients))
		emails := make([]string, 0, len(event.Recipients))
		for _, email := range event.Recipients {
			email = strings.ToLower(email)
			if _, exists := unique[email]; !exists {
				unique[email] = struct{}{}
				emails = append(emails, email)
			}
		}
		sort.Strings(emails)
		for _, email := range emails {
			if err := q.InsertSuppression(ctx, notificationssql.InsertSuppressionParams{Email: email, Reason: reason, SourceMessageID: &message.ID, CreatedAt: stamp(received)}); err != nil {
				return fmt.Errorf("store webhook suppression: %w", err)
			}
		}
	}
	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit notification webhook: %w", err)
	}
	return nil
}
