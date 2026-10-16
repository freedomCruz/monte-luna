package platform_test

import (
	"context"
	"errors"
	"io"
	"log/slog"
	"testing"
	"time"

	"github.com/freedomCruz/monte-luna/backend/internal/platform"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/testcontainers/testcontainers-go"
	pgcontainer "github.com/testcontainers/testcontainers-go/modules/postgres"
)

func relayDatabase(t *testing.T) *pgxpool.Pool {
	t.Helper()
	ctx, cancel := context.WithTimeout(t.Context(), 2*time.Minute)
	defer cancel()
	c, err := pgcontainer.Run(ctx, "postgres:18.6-bookworm@sha256:afc7e2d441324c0388fa80c3d24f733b4194a4eb7f47dd8ee2b08eb1a24a647c", pgcontainer.WithDatabase("relay_test"), pgcontainer.WithUsername("relay_test"), pgcontainer.WithPassword("relay_test"), pgcontainer.BasicWaitStrategies())
	if err != nil {
		t.Fatal(err)
	}
	testcontainers.CleanupContainer(t, c)
	url, err := c.ConnectionString(ctx, "sslmode=disable")
	if err != nil {
		t.Fatal(err)
	}
	pool, err := pgxpool.New(ctx, url)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(pool.Close)
	return pool
}
func execute(t *testing.T, pool *pgxpool.Pool, query string, args ...any) {
	t.Helper()
	if _, err := pool.Exec(t.Context(), query, args...); err != nil {
		t.Fatal(err)
	}
}
func countRows(t *testing.T, pool *pgxpool.Pool, query string, args ...any) int {
	t.Helper()
	var count int
	if err := pool.QueryRow(t.Context(), query, args...).Scan(&count); err != nil {
		t.Fatal(err)
	}
	return count
}

func TestRelayDeliveryRetryCleanupAndConsumerAtomicity(t *testing.T) {
	pool := relayDatabase(t)
	for _, schema := range []string{"catalog", "orders"} {
		execute(t, pool, "CREATE SCHEMA "+schema)
		execute(t, pool, `CREATE TABLE `+schema+`.outbox(id uuid PRIMARY KEY DEFAULT uuidv7(),type text NOT NULL,occurred_at timestamptz NOT NULL DEFAULT now(),payload jsonb NOT NULL,status text NOT NULL DEFAULT 'pending',attempts integer NOT NULL DEFAULT 0,available_at timestamptz NOT NULL DEFAULT now(),delivered_at timestamptz,last_error text,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now()); CREATE TABLE `+schema+`.processed_events(id uuid PRIMARY KEY,processed_at timestamptz NOT NULL DEFAULT now())`)
	}
	execute(t, pool, "CREATE TABLE orders.effects(id uuid PRIMARY KEY)")
	cfg := platform.DefaultRelayConfig()
	cfg.BatchSize = 1
	cfg.MaxAttempts = 2
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	relay, err := platform.NewRelay(pool, []string{"catalog", "orders"}, cfg, logger)
	if err != nil {
		t.Fatal(err)
	}
	fail := true
	consume := func(ctx context.Context, event platform.Event) error {
		return platform.ConsumeOnce(ctx, pool, "orders", event.ID, func(tx pgx.Tx) error {
			if _, err := tx.Exec(ctx, "INSERT INTO orders.effects VALUES ($1)", event.ID); err != nil {
				return err
			}
			if fail {
				return errors.New("consumer failed")
			}
			return nil
		})
	}
	relay.Subscribe("test.effect", consume)
	execute(t, pool, `INSERT INTO catalog.outbox(type,payload) VALUES ('test.effect','{}')`)
	now := time.Now().UTC().Add(time.Second)
	if _, err := relay.Poll(t.Context(), now); err != nil {
		t.Fatal(err)
	}
	if countRows(t, pool, "SELECT count(*) FROM orders.effects") != 0 || countRows(t, pool, "SELECT count(*) FROM orders.processed_events") != 0 {
		t.Fatal("failed consumer did not roll back effect and dedup guard")
	}
	if countRows(t, pool, "SELECT count(*) FROM catalog.outbox WHERE status='pending' AND attempts=1 AND available_at=$1", now.Add(time.Second)) != 1 {
		t.Fatal("missing first retry backoff")
	}
	fail = false
	if n, err := relay.Poll(t.Context(), now); err != nil || n != 0 {
		t.Fatalf("retry ran early: n=%d err=%v", n, err)
	}
	if _, err := relay.Poll(t.Context(), now.Add(time.Second)); err != nil {
		t.Fatal(err)
	}
	if countRows(t, pool, "SELECT count(*) FROM catalog.outbox WHERE status='delivered' AND attempts=2") != 1 || countRows(t, pool, "SELECT count(*) FROM orders.effects") != 1 {
		t.Fatal("delivery not persisted")
	}
	var id string
	if err := pool.QueryRow(t.Context(), "SELECT id::text FROM catalog.outbox").Scan(&id); err != nil {
		t.Fatal(err)
	}
	if err := consume(t.Context(), platform.Event{ID: id}); err != nil {
		t.Fatal(err)
	}
	if countRows(t, pool, "SELECT count(*) FROM orders.effects") != 1 {
		t.Fatal("duplicate effect")
	}
	fail = true
	execute(t, pool, `INSERT INTO orders.outbox(type,payload) VALUES ('test.effect','{}')`)
	for _, at := range []time.Time{now, now.Add(time.Second)} {
		if _, err := relay.Poll(t.Context(), at); err != nil {
			t.Fatal(err)
		}
	}
	if countRows(t, pool, "SELECT count(*) FROM orders.outbox WHERE status='failed' AND attempts=2") != 1 {
		t.Fatal("exhausted event was not retained as failed")
	}
	execute(t, pool, "UPDATE catalog.outbox SET delivered_at=$1", now.Add(-8*24*time.Hour))
	execute(t, pool, "UPDATE orders.processed_events SET processed_at=$1", now.Add(-8*24*time.Hour))
	execute(t, pool, "UPDATE orders.outbox SET created_at=$1", now.Add(-40*24*time.Hour))
	if err := relay.Cleanup(t.Context(), now); err != nil {
		t.Fatal(err)
	}
	if countRows(t, pool, "SELECT count(*) FROM catalog.outbox") != 0 || countRows(t, pool, "SELECT count(*) FROM orders.processed_events") != 0 || countRows(t, pool, "SELECT count(*) FROM orders.outbox WHERE status='failed'") != 1 {
		t.Fatal("retention deleted failed events or retained expired delivery/dedup rows")
	}
}

func TestRelaySkipLockedAndShutdown(t *testing.T) {
	pool := relayDatabase(t)
	execute(t, pool, `CREATE SCHEMA orders; CREATE TABLE orders.outbox(id uuid PRIMARY KEY DEFAULT uuidv7(),type text NOT NULL,occurred_at timestamptz NOT NULL DEFAULT now(),payload jsonb NOT NULL,status text NOT NULL DEFAULT 'pending',attempts integer NOT NULL DEFAULT 0,available_at timestamptz NOT NULL DEFAULT now(),delivered_at timestamptz,last_error text,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now()); CREATE TABLE orders.processed_events(id uuid PRIMARY KEY,processed_at timestamptz NOT NULL DEFAULT now()); INSERT INTO orders.outbox(type,payload) VALUES ('test','{}'),('test','{}')`)
	relay, err := platform.NewRelay(pool, []string{"orders"}, platform.DefaultRelayConfig(), slog.Default())
	if err != nil {
		t.Fatal(err)
	}
	tx, err := pool.Begin(t.Context())
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = tx.Rollback(t.Context()) }()
	var id string
	if err := tx.QueryRow(t.Context(), "SELECT id::text FROM orders.outbox ORDER BY id LIMIT 1 FOR UPDATE").Scan(&id); err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithTimeout(t.Context(), 3*time.Second)
	defer cancel()
	if n, err := relay.Poll(ctx, time.Now().Add(time.Second)); err != nil || n != 1 {
		t.Fatalf("locked event not skipped: n=%d err=%v", n, err)
	}
	if countRows(t, pool, "SELECT count(*) FROM orders.outbox WHERE id=$1 AND status='pending'", id) != 1 {
		t.Fatal("claimed a locked row")
	}
	stopped, stop := context.WithCancel(t.Context())
	stop()
	relay.Run(stopped)
}

func TestRelayConfigValidation(t *testing.T) {
	cfg := platform.DefaultRelayConfig()
	if cfg.PollInterval != time.Second || cfg.BatchSize != 100 || cfg.Retention != 7*24*time.Hour || cfg.CleanupInterval != time.Hour || cfg.MaxAttempts != 10 || cfg.InitialBackoff != time.Second || cfg.MaxBackoff != 15*time.Minute {
		t.Fatalf("incorrect defaults: %+v", cfg)
	}
	for _, field := range []string{"poll", "batch", "retention", "cleanup", "attempts", "initial", "max"} {
		t.Run(field, func(t *testing.T) {
			invalid := cfg
			switch field {
			case "poll":
				invalid.PollInterval = 0
			case "batch":
				invalid.BatchSize = 0
			case "retention":
				invalid.Retention = 0
			case "cleanup":
				invalid.CleanupInterval = 0
			case "attempts":
				invalid.MaxAttempts = 0
			case "initial":
				invalid.InitialBackoff = 0
			case "max":
				invalid.MaxBackoff = 0
			}
			if _, err := platform.NewRelay(nil, []string{"orders"}, invalid, slog.Default()); err == nil {
				t.Fatal("invalid config accepted")
			}
		})
	}
	if _, err := platform.NewRelay(nil, []string{"orders; DROP SCHEMA orders"}, cfg, slog.Default()); err == nil {
		t.Fatal("unsafe schema accepted")
	}
}
