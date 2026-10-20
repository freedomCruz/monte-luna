package postgres

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	notificationssql "github.com/freedomCruz/monte-luna/backend/internal/notifications/adapters/postgres/sqlc"
	"github.com/freedomCruz/monte-luna/backend/internal/notifications/domain"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Repository struct{ pool *pgxpool.Pool }

var _ domain.Repository = (*Repository)(nil)

func NewRepository(pool *pgxpool.Pool) *Repository { return &Repository{pool: pool} }
func stamp(t time.Time) pgtype.Timestamptz         { return pgtype.Timestamptz{Time: t.UTC(), Valid: true} }

// Intake commits the deduplication guard and local message together. Repeated
// events return their existing message, including pending/failed delivery work.
// Source uniqueness survives expiration of the short-lived processed ledger.
func (r *Repository) Intake(ctx context.Context, in domain.Intake, now time.Time) (domain.Message, error) {
	if err := in.Validate(); err != nil {
		return domain.Message{}, err
	}
	data, err := json.Marshal(in.TemplateData)
	if err != nil {
		return domain.Message{}, fmt.Errorf("encode notification data: %w", err)
	}
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return domain.Message{}, fmt.Errorf("begin notification intake: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()
	q := notificationssql.New(tx)
	// This unique insert serializes concurrent intake of the same source event.
	if err := q.RecordIntake(ctx, notificationssql.RecordIntakeParams{EventID: in.SourceEventID, EventType: in.EventType, ProcessedAt: stamp(now)}); err != nil {
		return domain.Message{}, fmt.Errorf("record notification intake: %w", err)
	}
	email := strings.ToLower(in.RecipientEmail)
	suppressed, err := q.IsSuppressed(ctx, email)
	if err != nil {
		return domain.Message{}, fmt.Errorf("check notification suppression: %w", err)
	}
	status := "pending"
	if suppressed {
		status = "suppressed"
	}
	if err := q.InsertMessage(ctx, notificationssql.InsertMessageParams{SourceEventID: in.SourceEventID, TemplateKey: in.TemplateKey, RecipientEmail: &email, TemplateData: data, Status: status, CreatedAt: stamp(now)}); err != nil {
		return domain.Message{}, fmt.Errorf("insert notification message: %w", err)
	}
	row, err := q.LockMessageBySource(ctx, in.SourceEventID)
	if err != nil {
		return domain.Message{}, fmt.Errorf("read notification message: %w", err)
	}
	// Always check the persisted recipient, not a possibly changed replay payload.
	if (row.Status == "pending" || row.Status == "failed") && row.RecipientEmail != nil {
		suppressed, err = q.IsSuppressed(ctx, strings.ToLower(*row.RecipientEmail))
		if err != nil {
			return domain.Message{}, fmt.Errorf("recheck notification suppression: %w", err)
		}
		if suppressed {
			row, err = q.SuppressPending(ctx, notificationssql.SuppressPendingParams{ID: row.ID, UpdatedAt: stamp(now)})
			if err != nil {
				return domain.Message{}, fmt.Errorf("suppress notification message: %w", err)
			}
		}
	}
	message, err := messageFromRow(row)
	if err != nil {
		return domain.Message{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return domain.Message{}, fmt.Errorf("commit notification intake: %w", err)
	}
	return message, nil
}

func messageFromRow(row notificationssql.NotificationsEmailMessage) (domain.Message, error) {
	var data domain.TemplateData
	if err := json.Unmarshal(row.TemplateData, &data); err != nil {
		return domain.Message{}, fmt.Errorf("decode stored notification data: %w", err)
	}
	message := domain.Message{ID: row.ID, SourceEventID: row.SourceEventID, TemplateKey: row.TemplateKey, RecipientEmail: row.RecipientEmail, TemplateData: data, Status: row.Status, Provider: row.Provider, ProviderMessageID: row.ProviderMessageID, Attempts: row.Attempts, LastError: row.LastError, CreatedAt: row.CreatedAt.Time, UpdatedAt: row.UpdatedAt.Time}
	if row.SentAt.Valid {
		message.SentAt = &row.SentAt.Time
	}
	return message, nil
}

func (r *Repository) IsSuppressed(ctx context.Context, email string) (bool, error) {
	if !domain.ValidEmail(email) {
		return false, errors.New("invalid suppression email")
	}
	result, err := notificationssql.New(r.pool).IsSuppressed(ctx, strings.ToLower(email))
	if err != nil {
		return false, fmt.Errorf("read suppression: %w", err)
	}
	return result, nil
}

// Suppress never removes or expires an existing suppression. The first reason
// and source remain stable; later provider events cannot resume delivery.
func (r *Repository) Suppress(ctx context.Context, email, reason string, sourceMessageID *string, now time.Time) error {
	if !domain.ValidEmail(email) || (reason != "hard_bounce" && reason != "complaint" && reason != "manual") {
		return errors.New("invalid notification suppression")
	}
	if err := notificationssql.New(r.pool).InsertSuppression(ctx, notificationssql.InsertSuppressionParams{Email: strings.ToLower(email), Reason: reason, SourceMessageID: sourceMessageID, CreatedAt: stamp(now)}); err != nil {
		return fmt.Errorf("store notification suppression: %w", err)
	}
	return nil
}

// Cleanup performs at most batchSize changes per policy in a single transaction.
// Scheduling (hourly by default) belongs to application wiring, not persistence.
func (r *Repository) Cleanup(ctx context.Context, now time.Time, batchSize int32) error {
	if batchSize <= 0 {
		return errors.New("notification cleanup batch size must be positive")
	}
	now = now.UTC()
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin notification retention: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()
	q := notificationssql.New(tx)
	if err := q.DeleteProcessedEvents(ctx, notificationssql.DeleteProcessedEventsParams{ProcessedAt: stamp(now.AddDate(0, 0, -7)), Limit: batchSize}); err != nil {
		return fmt.Errorf("clean notification intake ledger: %w", err)
	}
	if err := q.DeleteProviderWebhookEvents(ctx, notificationssql.DeleteProviderWebhookEventsParams{ReceivedAt: stamp(now.AddDate(0, 0, -30)), Limit: batchSize}); err != nil {
		return fmt.Errorf("clean notification webhook ledger: %w", err)
	}
	if err := q.ClearTemplateData(ctx, notificationssql.ClearTemplateDataParams{NowAt: stamp(now), Cutoff: stamp(now.AddDate(0, 0, -90)), BatchSize: batchSize}); err != nil {
		return fmt.Errorf("clear notification template data: %w", err)
	}
	if err := q.AnonymizeRecipients(ctx, notificationssql.AnonymizeRecipientsParams{NowAt: stamp(now), Cutoff: stamp(now.AddDate(-2, 0, 0)), BatchSize: batchSize}); err != nil {
		return fmt.Errorf("anonymize notification recipients: %w", err)
	}
	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit notification retention: %w", err)
	}
	return nil
}
