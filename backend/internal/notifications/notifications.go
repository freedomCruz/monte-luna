// Package notifications is the module's only public surface.
package notifications

import (
	"context"
	"database/sql"
	"errors"
	"log/slog"
	"net/http"
	"time"

	"github.com/freedomCruz/monte-luna/backend/internal/notifications/adapters"
	"github.com/freedomCruz/monte-luna/backend/internal/notifications/adapters/postgres"
	"github.com/freedomCruz/monte-luna/backend/internal/notifications/app"
	"github.com/freedomCruz/monte-luna/backend/internal/notifications/domain"
	"github.com/freedomCruz/monte-luna/backend/internal/platform"
	"github.com/jackc/pgx/v5/pgxpool"
)

// EmailSender delivers an email to an upstream provider or test capture.
type EmailSender = domain.EmailSender

// NewCaptureSender returns a process-local in-memory capture sender for tests and development.
func NewCaptureSender() domain.EmailSender {
	return adapters.NewCaptureSender()
}

// CapturedMessages returns the captured emails if sender is a capture sender.
func CapturedMessages(sender domain.EmailSender) []Email {
	if c, ok := sender.(interface{ Messages() []domain.Email }); ok {
		return c.Messages()
	}
	return nil
}
// TokenDecryptor and LinkBuilder are implemented by the composition root on top
// of Identity's public facade; Notifications never guesses token URLs.
type TokenDecryptor = domain.TokenDecryptor
type LinkBuilder = domain.LinkBuilder
type Email = domain.Email

// Options overrides runtime collaborators; the zero value uses the wall clock.
type Options struct {
	Clock  func() time.Time
	Sender domain.EmailSender
}

// cleanupBatchSize bounds each retention policy per scheduled run.
const cleanupBatchSize int32 = 100

type Module struct {
	pool       *pgxpool.Pool
	repository *postgres.Repository
	renderer   domain.Renderer
	sender     domain.EmailSender
	webhook    http.Handler
	cleanup    func(context.Context, time.Time, int32) error
	now        func() time.Time
	logger     *slog.Logger
}

func Migrate(ctx context.Context, db *sql.DB) error { return postgres.Migrate(ctx, db) }

// Down is for disposable test databases only, never production operations.
func Down(ctx context.Context, db *sql.DB) error { return postgres.Down(ctx, db) }

func New(ctx context.Context, databaseURL string, cfg Config, logger *slog.Logger, options Options) (*Module, error) {
	if err := cfg.Validate(); err != nil {
		return nil, err
	}
	startup, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()
	pool, err := pgxpool.New(startup, databaseURL)
	if err != nil {
		return nil, errors.New("initialize notifications PostgreSQL pool")
	}
	if err := pool.Ping(startup); err != nil {
		pool.Close()
		return nil, errors.New("connect notifications PostgreSQL pool")
	}
	module, err := build(pool, cfg, logger, options)
	if err != nil {
		pool.Close()
		return nil, err
	}
	return module, nil
}

// build wires adapters on an existing pool without connecting to it.
func build(pool *pgxpool.Pool, cfg Config, logger *slog.Logger, options Options) (*Module, error) {
	if err := cfg.Validate(); err != nil {
		return nil, err
	}
	if logger == nil {
		logger = slog.Default()
	}
	now := options.Clock
	if now == nil {
		now = time.Now
	}
	renderer, err := adapters.NewTemplateRenderer()
	if err != nil {
		return nil, err
	}
	repository := postgres.NewRepository(pool)
	module := &Module{pool: pool, repository: repository, renderer: renderer, cleanup: repository.Cleanup, now: now, logger: logger}
	if options.Sender != nil {
		module.sender = options.Sender
		return module, nil
	}
	switch cfg.Sender {
	case SenderResend:
		sender, err := adapters.NewResendSender(cfg.ResendAPIKey, cfg.ResendFrom, &http.Client{Timeout: cfg.HTTPTimeout})
		if err != nil {
			return nil, errors.New("RESEND_API_KEY or RESEND_FROM is invalid")
		}
		webhook, err := adapters.NewResendWebhook(repository, cfg.ResendWebhookSecret, now)
		if err != nil {
			return nil, errors.New("RESEND_WEBHOOK_SECRET is invalid")
		}
		module.sender, module.webhook = sender, webhook
	default:
		module.sender = adapters.NewCaptureSender()
	}
	return module, nil
}

// RegisterRoutes mounts the delivery webhook only for Resend, which needs a
// public HTTPS URL to reach it; capture mode exposes no notifications routes.
func (m *Module) RegisterRoutes(mux *http.ServeMux) {
	if m.webhook != nil {
		mux.Handle("POST /api/v1/notifications/webhooks/resend", m.webhook)
	}
}

// Consumer returns the outbox handler for Identity email events. The caller
// subscribes it; decrypted tokens and links exist only during each call.
func (m *Module) Consumer(decryptor TokenDecryptor, links LinkBuilder) (platform.Consumer, error) {
	if decryptor == nil || links == nil {
		return nil, errors.New("notifications consumer requires a token decryptor and link builder")
	}
	consumer := app.NewConsumer(m.repository, m.renderer, m.sender, decryptor, links, m.now)
	return func(ctx context.Context, event platform.Event) error {
		return consumer.Handle(ctx, domain.Event{ID: event.ID, Type: event.Type, Payload: event.Payload})
	}, nil
}

// Cleanup runs one bounded retention pass over every notifications policy.
func (m *Module) Cleanup(ctx context.Context, now time.Time) error {
	return m.cleanup(ctx, now, cleanupBatchSize)
}

// RunJobs blocks until cancellation and must be joined before Close.
func (m *Module) RunJobs(ctx context.Context, interval time.Duration) {
	if interval <= 0 {
		m.logger.Error("invalid notifications cleanup interval")
		return
	}
	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	m.runJobs(ctx, ticker.C)
}

func (m *Module) runJobs(ctx context.Context, ticks <-chan time.Time) {
	for {
		select {
		case <-ctx.Done():
			return
		case now := <-ticks:
			// Retention errors may carry database details; log only a fixed message.
			if err := m.Cleanup(ctx, now); err != nil && ctx.Err() == nil {
				m.logger.Error("notifications retention cleanup failed")
			}
		}
	}
}

func (m *Module) Close() { m.pool.Close() }
