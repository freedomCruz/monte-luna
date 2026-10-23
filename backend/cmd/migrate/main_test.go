package main

import (
	"context"
	"database/sql"
	"testing"
	"time"

	_ "github.com/jackc/pgx/v5/stdlib"
	"github.com/testcontainers/testcontainers-go"
	pgcontainer "github.com/testcontainers/testcontainers-go/modules/postgres"
)

func TestRunModuleRejectsUnknownModule(t *testing.T) {
	if err := runModule(t.Context(), "invoicing"); err == nil || err.Error() != "module must be all, catalog, shipping, orders, payments, identity or notifications" {
		t.Fatalf("error=%v", err)
	}
}

func TestRunModuleAppliesIdentityAndNotificationsAfterExistingModules(t *testing.T) {
	ctx, cancel := context.WithTimeout(t.Context(), 3*time.Minute)
	defer cancel()
	container, err := pgcontainer.Run(ctx, "postgres:18.6-bookworm@sha256:afc7e2d441324c0388fa80c3d24f733b4194a4eb7f47dd8ee2b08eb1a24a647c", pgcontainer.WithDatabase("migrate_test"), pgcontainer.WithUsername("migrate_test"), pgcontainer.WithPassword("migrate_test"), pgcontainer.BasicWaitStrategies())
	if err != nil {
		t.Fatal(err)
	}
	testcontainers.CleanupContainer(t, container)
	url, err := container.ConnectionString(ctx, "sslmode=disable")
	if err != nil {
		t.Fatal(err)
	}
	t.Setenv("DATABASE_URL", url)
	db, err := sql.Open("pgx", url)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = db.Close() }()
	schemas := func() map[string]bool {
		t.Helper()
		rows, err := db.QueryContext(ctx, `SELECT table_schema FROM information_schema.tables WHERE table_name='goose_db_version'`)
		if err != nil {
			t.Fatal(err)
		}
		defer func() { _ = rows.Close() }()
		found := map[string]bool{}
		for rows.Next() {
			var schema string
			if err := rows.Scan(&schema); err != nil {
				t.Fatal(err)
			}
			found[schema] = true
		}
		return found
	}
	if err := runModule(ctx, "identity"); err != nil {
		t.Fatal(err)
	}
	if got := schemas(); len(got) != 1 || !got["identity"] {
		t.Fatalf("identity-only run applied %v", got)
	}
	if err := runModule(ctx, "notifications"); err != nil {
		t.Fatal(err)
	}
	if got := schemas(); len(got) != 2 || !got["notifications"] {
		t.Fatalf("notifications-only run applied %v", got)
	}
	for range 2 {
		if err := runModule(ctx, "all"); err != nil {
			t.Fatal(err)
		}
	}
	got := schemas()
	for _, schema := range []string{"catalog", "shipping", "orders", "payments", "identity", "notifications"} {
		if !got[schema] {
			t.Fatalf("all did not migrate %s: %v", schema, got)
		}
	}
}

func TestRunModuleAcceptsIdentityAndNotifications(t *testing.T) {
	t.Setenv("DATABASE_URL", "")
	for _, module := range []string{"identity", "notifications", "payments"} {
		t.Run(module, func(t *testing.T) {
			if err := runModule(t.Context(), module); err == nil || err.Error() != "DATABASE_URL is required" {
				t.Fatalf("error=%v", err)
			}
		})
	}
}
