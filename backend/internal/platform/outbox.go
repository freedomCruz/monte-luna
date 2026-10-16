package platform

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"regexp"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Event is the durable envelope shared by in-process subscribers.
type Event struct {
	ID, Type   string
	OccurredAt time.Time
	Payload    json.RawMessage
}
type Consumer func(context.Context, Event) error

type RelayConfig struct {
	PollInterval, CleanupInterval, Retention time.Duration
	BatchSize, MaxAttempts                   int
	InitialBackoff, MaxBackoff               time.Duration
}

func DefaultRelayConfig() RelayConfig {
	return RelayConfig{PollInterval: time.Second, CleanupInterval: time.Hour, Retention: 7 * 24 * time.Hour, BatchSize: 100, MaxAttempts: 10, InitialBackoff: time.Second, MaxBackoff: 15 * time.Minute}
}
func (c RelayConfig) Validate() error {
	if c.PollInterval <= 0 || c.CleanupInterval <= 0 || c.Retention <= 0 || c.BatchSize <= 0 || c.MaxAttempts <= 0 || c.InitialBackoff <= 0 || c.MaxBackoff < c.InitialBackoff {
		return errors.New("outbox intervals, retention, batch size and attempts must be positive; maximum backoff must be at least initial backoff")
	}
	return nil
}
func validSchema(schema string) bool {
	return regexp.MustCompile(`^[a-z][a-z0-9_]*$`).MatchString(schema)
}

type Relay struct {
	pool      *pgxpool.Pool
	schemas   []string
	config    RelayConfig
	logger    *slog.Logger
	consumers map[string][]Consumer
}

func NewRelay(pool *pgxpool.Pool, schemas []string, cfg RelayConfig, logger *slog.Logger) (*Relay, error) {
	if err := cfg.Validate(); err != nil {
		return nil, err
	}
	seen := make(map[string]bool)
	for _, schema := range schemas {
		if !validSchema(schema) || seen[schema] {
			return nil, errors.New("outbox schemas must be distinct SQL identifiers")
		}
		seen[schema] = true
	}
	if logger == nil {
		logger = slog.Default()
	}
	return &Relay{pool: pool, schemas: append([]string(nil), schemas...), config: cfg, logger: logger, consumers: make(map[string][]Consumer)}, nil
}

// Subscribe must be called during startup, before Run. Each subscriber owns its
// transactional deduplication guard; a partial dispatch may be retried in full.
func (r *Relay) Subscribe(eventType string, consumer Consumer) {
	r.consumers[eventType] = append(r.consumers[eventType], consumer)
}
func (r *Relay) Run(ctx context.Context) {
	poll := time.NewTicker(r.config.PollInterval)
	defer poll.Stop()
	cleanup := time.NewTicker(r.config.CleanupInterval)
	defer cleanup.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case now := <-poll.C:
			if _, err := r.Poll(ctx, now.UTC()); err != nil && ctx.Err() == nil {
				r.logger.Error("outbox poll failed")
			}
		case now := <-cleanup.C:
			if err := r.Cleanup(ctx, now.UTC()); err != nil && ctx.Err() == nil {
				r.logger.Error("outbox cleanup failed")
			}
		}
	}
}

// Poll locks source rows until dispatch and delivery bookkeeping commit. Other
// relays skip these locks; consumers use independent module-local transactions.
func (r *Relay) Poll(ctx context.Context, now time.Time) (int, error) {
	total := 0
	for _, schema := range r.schemas {
		if total >= r.config.BatchSize {
			break
		}
		n, err := r.pollSchema(ctx, schema, now, r.config.BatchSize-total)
		total += n
		if err != nil {
			return total, err
		}
	}
	return total, nil
}
func (r *Relay) pollSchema(ctx context.Context, schema string, now time.Time, limit int) (int, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return 0, fmt.Errorf("begin relay: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()
	table := pgx.Identifier{schema, "outbox"}.Sanitize()
	rows, err := tx.Query(ctx, `SELECT id::text,type,occurred_at,payload,attempts FROM `+table+` WHERE status='pending' AND available_at <= $1 ORDER BY available_at,id LIMIT $2 FOR UPDATE SKIP LOCKED`, now, limit)
	if err != nil {
		return 0, fmt.Errorf("claim outbox: %w", err)
	}
	type claim struct {
		event    Event
		attempts int
	}
	var claimed []claim
	for rows.Next() {
		var c claim
		if err := rows.Scan(&c.event.ID, &c.event.Type, &c.event.OccurredAt, &c.event.Payload, &c.attempts); err != nil {
			rows.Close()
			return 0, err
		}
		claimed = append(claimed, c)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return 0, err
	}
	for _, c := range claimed {
		var dispatchErr error
		for _, consumer := range r.consumers[c.event.Type] {
			if dispatchErr = consumer(ctx, c.event); dispatchErr != nil {
				break
			}
		}
		if ctx.Err() != nil {
			return 0, ctx.Err()
		}
		if dispatchErr == nil {
			_, err = tx.Exec(ctx, `UPDATE `+table+` SET status='delivered',attempts=attempts+1,delivered_at=$2,last_error=NULL,updated_at=$2 WHERE id=$1`, c.event.ID, now)
		} else {
			status := "pending"
			if c.attempts+1 >= r.config.MaxAttempts {
				status = "failed"
				r.logger.Error("outbox event exhausted retries", "event_id", c.event.ID, "event_type", c.event.Type, "module", schema, "attempts", c.attempts+1)
			}
			// Never persist arbitrary consumer errors: they may contain private data.
			_, err = tx.Exec(ctx, `UPDATE `+table+` SET status=$2,attempts=attempts+1,available_at=$3,last_error='consumer delivery failed',updated_at=$4 WHERE id=$1`, c.event.ID, status, now.Add(r.backoff(c.attempts)), now)
		}
		if err != nil {
			return 0, fmt.Errorf("record outbox delivery: %w", err)
		}
	}
	if err := tx.Commit(ctx); err != nil {
		return 0, fmt.Errorf("commit relay: %w", err)
	}
	return len(claimed), nil
}
func (r *Relay) backoff(previousAttempts int) time.Duration {
	delay := r.config.InitialBackoff
	for range previousAttempts {
		if delay >= r.config.MaxBackoff/2 {
			return r.config.MaxBackoff
		}
		delay *= 2
	}
	return min(delay, r.config.MaxBackoff)
}

// Cleanup is deliberately restricted to delivered events and successful guards.
// Failed and not-yet-delivered events are never removed automatically.
func (r *Relay) Cleanup(ctx context.Context, now time.Time) error {
	for _, schema := range r.schemas {
		for _, entry := range []struct{ table, column, condition string }{{"outbox", "delivered_at", "status='delivered' AND "}, {"processed_events", "processed_at", ""}} {
			table := pgx.Identifier{schema, entry.table}.Sanitize()
			_, err := r.pool.Exec(ctx, `DELETE FROM `+table+` WHERE id IN (SELECT id FROM `+table+` WHERE `+entry.condition+entry.column+` < $1 ORDER BY `+entry.column+`,id LIMIT $2)`, now.Add(-r.config.Retention), r.config.BatchSize)
			if err != nil {
				return fmt.Errorf("cleanup outbox retention: %w", err)
			}
		}
	}
	return nil
}

// ConsumeOnce commits the event guard together with the module-local effect.
// An error rolls back both, allowing the relay to deliver the event again.
func ConsumeOnce(ctx context.Context, pool *pgxpool.Pool, schema, eventID string, effect func(pgx.Tx) error) error {
	if !validSchema(schema) {
		return errors.New("invalid consumer schema")
	}
	tx, err := pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin consumer: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()
	result, err := tx.Exec(ctx, `INSERT INTO `+pgx.Identifier{schema, "processed_events"}.Sanitize()+` (id) VALUES ($1) ON CONFLICT DO NOTHING`, eventID)
	if err != nil {
		return fmt.Errorf("claim consumer event: %w", err)
	}
	if result.RowsAffected() == 0 {
		return nil
	}
	if err := effect(tx); err != nil {
		return err
	}
	return tx.Commit(ctx)
}
