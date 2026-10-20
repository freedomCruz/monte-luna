package postgres_test

import (
	"context"
	"database/sql"
	"testing"
	"time"

	"github.com/freedomCruz/monte-luna/backend/internal/notifications/adapters/postgres"
	"github.com/jackc/pgx/v5/pgxpool"
	_ "github.com/jackc/pgx/v5/stdlib"
	"github.com/testcontainers/testcontainers-go"
	pgcontainer "github.com/testcontainers/testcontainers-go/modules/postgres"
)

func database(t *testing.T) (*sql.DB, *pgxpool.Pool) {
	t.Helper()
	ctx, cancel := context.WithTimeout(t.Context(), 2*time.Minute)
	defer cancel()
	c, err := pgcontainer.Run(ctx, "postgres:18.6-bookworm@sha256:afc7e2d441324c0388fa80c3d24f733b4194a4eb7f47dd8ee2b08eb1a24a647c", pgcontainer.WithDatabase("notifications_test"), pgcontainer.WithUsername("notifications_test"), pgcontainer.WithPassword("notifications_test"), pgcontainer.BasicWaitStrategies())
	if err != nil {
		t.Fatal(err)
	}
	testcontainers.CleanupContainer(t, c)
	url, err := c.ConnectionString(ctx, "sslmode=disable")
	if err != nil {
		t.Fatal(err)
	}
	db, err := sql.Open("pgx", url)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if err := db.Close(); err != nil {
			t.Error(err)
		}
	})
	pool, err := pgxpool.New(ctx, url)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(pool.Close)
	return db, pool
}
func exec(t *testing.T, db *sql.DB, query string, args ...any) {
	t.Helper()
	if _, err := db.ExecContext(t.Context(), query, args...); err != nil {
		t.Fatal(err)
	}
}
func scalar[T any](t *testing.T, db *sql.DB, query string, args ...any) T {
	t.Helper()
	var result T
	if err := db.QueryRowContext(t.Context(), query, args...).Scan(&result); err != nil {
		t.Fatal(err)
	}
	return result
}
func snapshot(t *testing.T, db *sql.DB) string {
	t.Helper()
	var result string
	for _, table := range []string{"email_messages", "email_suppressions", "provider_webhook_events", "processed_events"} {
		result += scalar[string](t, db, `SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY to_jsonb(r)::text),'[]')::text FROM notifications.`+table+` r`)
	}
	return result
}

func TestMigrationRoundTripAndConstraints(t *testing.T) {
	db, _ := database(t)
	for range 2 {
		if err := postgres.Migrate(t.Context(), db); err != nil {
			t.Fatal(err)
		}
		if err := postgres.Migrate(t.Context(), db); err != nil {
			t.Fatal(err)
		}
		if snapshot(t, db) != "[][][][]" {
			t.Fatal("migration inserted business data")
		}
		if scalar[bool](t, db, `SELECT to_regclass('public.goose_db_version') IS NOT NULL`) {
			t.Fatal("public version table")
		}
		if scalar[int](t, db, `SELECT count(*) FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace WHERE n.nspname='notifications' AND c.contype='f' AND c.confrelid NOT IN (SELECT oid FROM pg_class WHERE relnamespace=n.oid)`) != 0 {
			t.Fatal("cross-schema foreign key")
		}
		id := scalar[string](t, db, `INSERT INTO notifications.email_messages(source_event_id,template_key,recipient_email) VALUES(uuidv7(),'password_reset','admin@example.com') RETURNING id`)
		if scalar[int](t, db, `SELECT uuid_extract_version(id) FROM notifications.email_messages WHERE id=$1`, id) != 7 {
			t.Fatal("not UUIDv7")
		}
		for _, query := range []string{
			`UPDATE notifications.email_messages SET template_key='Bad key'`,
			`UPDATE notifications.email_messages SET status='unknown'`,
			`UPDATE notifications.email_messages SET attempts=-1`,
			`INSERT INTO notifications.email_messages(source_event_id,template_key) SELECT source_event_id,template_key FROM notifications.email_messages`,
			`INSERT INTO notifications.email_suppressions(email,reason) VALUES('UPPER@example.com','manual')`,
			`INSERT INTO notifications.email_suppressions(email,reason) VALUES('admin@example.com','temporary')`,
		} {
			before := snapshot(t, db)
			if _, err := db.ExecContext(t.Context(), query); err == nil {
				t.Fatalf("accepted %s", query)
			}
			if snapshot(t, db) != before {
				t.Fatal("rejection changed data")
			}
		}
		exec(t, db, `INSERT INTO notifications.email_suppressions(email,reason,source_message_id) VALUES('admin@example.com','manual',$1)`, id)
		exec(t, db, `INSERT INTO notifications.provider_webhook_events(provider,external_event_id,event_type) VALUES('resend','evt_1','email.delivered')`)
		for _, query := range []string{
			`INSERT INTO notifications.email_suppressions(email,reason) VALUES('admin@example.com','complaint')`,
			`INSERT INTO notifications.provider_webhook_events(provider,external_event_id,event_type) VALUES('resend','evt_1','email.delivered')`,
		} {
			before := snapshot(t, db)
			if _, err := db.ExecContext(t.Context(), query); err == nil {
				t.Fatal("duplicate accepted")
			}
			if snapshot(t, db) != before {
				t.Fatal("duplicate mutated state")
			}
		}
		exec(t, db, `DELETE FROM notifications.email_messages WHERE id=$1`, id)
		if !scalar[bool](t, db, `SELECT source_message_id IS NULL FROM notifications.email_suppressions`) {
			t.Fatal("suppression FK must SET NULL")
		}
		if err := postgres.Down(t.Context(), db); err != nil {
			t.Fatal(err)
		}
		if scalar[int](t, db, `SELECT count(*) FROM information_schema.tables WHERE table_schema='notifications' AND table_name<>'goose_db_version'`) != 0 {
			t.Fatal("Down left tables")
		}
	}
	if err := postgres.Migrate(t.Context(), db); err != nil {
		t.Fatal(err)
	}
}
