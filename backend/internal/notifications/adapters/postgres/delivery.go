package postgres

import (
	"context"
	"errors"
	"fmt"
	"time"

	notificationssql "github.com/freedomCruz/monte-luna/backend/internal/notifications/adapters/postgres/sqlc"
	"github.com/freedomCruz/monte-luna/backend/internal/notifications/domain"
)

var _ domain.DeliveryRepository = (*Repository)(nil)

func (r *Repository) RecordSent(ctx context.Context, id string, result domain.SendResult, now time.Time) error {
	if result.Provider == "" || result.MessageID == "" {
		return errors.New("invalid notification delivery result")
	}
	if err := notificationssql.New(r.pool).RecordSent(ctx, notificationssql.RecordSentParams{ID: id, Provider: result.Provider, ProviderMessageID: &result.MessageID, SentAt: stamp(now)}); err != nil {
		return fmt.Errorf("record accepted notification: %w", err)
	}
	return nil
}
func (r *Repository) RecordFailure(ctx context.Context, id string, now time.Time) error {
	if err := notificationssql.New(r.pool).RecordFailure(ctx, notificationssql.RecordFailureParams{ID: id, UpdatedAt: stamp(now)}); err != nil {
		return fmt.Errorf("record notification failure: %w", err)
	}
	return nil
}
