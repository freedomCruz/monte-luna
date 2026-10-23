package main

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/base64"
	"strings"
	"testing"
	"time"

	"github.com/freedomCruz/monte-luna/backend/internal/identity"
	_ "github.com/jackc/pgx/v5/stdlib"
	"github.com/testcontainers/testcontainers-go"
	pgcontainer "github.com/testcontainers/testcontainers-go/modules/postgres"
)

const fixtureKey = "a2tra2tra2tra2tra2tra2tra2tra2tra2tra2tra2s="

func env(values map[string]string) func(string) string {
	return func(name string) string { return values[name] }
}

func invoke(t *testing.T, getenv func(string) string, stdin string, args ...string) (int, string, string) {
	t.Helper()
	var stdout, stderr bytes.Buffer
	code := run(t.Context(), args, strings.NewReader(stdin), &stdout, &stderr, getenv)
	return code, stdout.String(), stderr.String()
}

func TestAdminConfigurationFailsWithoutEchoingValues(t *testing.T) {
	if decoded, err := base64.StdEncoding.DecodeString(fixtureKey); err != nil || len(decoded) != 32 {
		t.Fatal("fixture key must decode to 32 bytes")
	}
	code, stdout, stderr := invoke(t, env(nil), "", "--help")
	if code != 0 || stdout != identity.CLIUsage || stderr != "" {
		t.Fatalf("help %d %q %q", code, stdout, stderr)
	}
	for _, tc := range []struct {
		name string
		env  map[string]string
		want string
	}{
		{"missing database", map[string]string{"APP_ENCRYPTION_KEY": fixtureKey, "STOREFRONT_BASE_URL": "https://store.test"}, "DATABASE_URL is required\n"},
		{"invalid database", map[string]string{"DATABASE_URL": "not-a-connection-string secret", "APP_ENCRYPTION_KEY": fixtureKey, "STOREFRONT_BASE_URL": "https://store.test"}, "DATABASE_URL must be a valid PostgreSQL connection string\n"},
		{"missing key", map[string]string{"DATABASE_URL": "postgres://demo:demo@localhost/demo", "STOREFRONT_BASE_URL": "https://store.test"}, "APP_ENCRYPTION_KEY is required\n"},
		{"invalid key", map[string]string{"DATABASE_URL": "postgres://demo:demo@localhost/demo", "APP_ENCRYPTION_KEY": "secret-value", "STOREFRONT_BASE_URL": "https://store.test"}, "APP_ENCRYPTION_KEY must be standard base64 encoding exactly 32 bytes\n"},
		{"missing base", map[string]string{"DATABASE_URL": "postgres://demo:demo@localhost/demo", "APP_ENCRYPTION_KEY": fixtureKey}, "STOREFRONT_BASE_URL is required\n"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			code, stdout, stderr := invoke(t, env(tc.env), "owner passphrase value\n", "create-owner", "--email", "owner@example.test", "--name", "Owner")
			if code != 1 || stdout != "" || stderr != tc.want || strings.Contains(stderr, "secret") || strings.Contains(stderr, fixtureKey) {
				t.Fatalf("exit %d stdout %q stderr %q", code, stdout, stderr)
			}
		})
	}
}

func TestAdminCommandsAgainstPostgres(t *testing.T) {
	ctx, cancel := context.WithTimeout(t.Context(), 2*time.Minute)
	defer cancel()
	container, err := pgcontainer.Run(ctx, "postgres:18.6-bookworm@sha256:afc7e2d441324c0388fa80c3d24f733b4194a4eb7f47dd8ee2b08eb1a24a647c", pgcontainer.WithDatabase("admin_cli"), pgcontainer.WithUsername("admin_cli"), pgcontainer.WithPassword("admin_cli"), pgcontainer.BasicWaitStrategies())
	if err != nil {
		t.Fatal(err)
	}
	testcontainers.CleanupContainer(t, container)
	url, err := container.ConnectionString(ctx, "sslmode=disable")
	if err != nil {
		t.Fatal(err)
	}
	db, err := sql.Open("pgx", url)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = db.Close() }()
	if err := identity.Migrate(ctx, db); err != nil {
		t.Fatal(err)
	}
	getenv := env(map[string]string{"DATABASE_URL": url, "APP_ENCRYPTION_KEY": fixtureKey, "STOREFRONT_BASE_URL": "https://store.test"})
	const password = "owner bootstrap passphrase"
	for _, tc := range []struct {
		name, stdin    string
		args           []string
		code           int
		stdout, stderr string
	}{
		{"password argument rejected", "", []string{"create-owner", "--email", "owner@example.test", "--name", "Owner", "--password", password}, 2, "", "Invalid command arguments.\n" + identity.CLIUsage},
		{"short password rejected", "short\n", []string{"create-owner", "--email", "owner@example.test", "--name", "Owner"}, 2, "", "Invalid administrator input.\n"},
		{"create owner", password + "\n", []string{"create-owner", "--email", "owner@example.test", "--name", "Owner"}, 0, "Administrator command completed.\n", ""},
		{"second owner refused", password + "\n", []string{"create-owner", "--email", "other@example.test", "--name", "Other"}, 1, "", "Initial owner already exists.\n"},
		{"reset password", "replacement owner passphrase\n", []string{"reset-password", "--email", "owner@example.test"}, 0, "Administrator command completed.\n", ""},
		{"reset unknown", "replacement owner passphrase\n", []string{"reset-password", "--email", "missing@example.test"}, 1, "", "Administrator not found.\n"},
		{"reset totp", "", []string{"reset-totp", "--email", "owner@example.test"}, 0, "Administrator command completed.\n", ""},
	} {
		t.Run(tc.name, func(t *testing.T) {
			code, stdout, stderr := invoke(t, getenv, tc.stdin, tc.args...)
			if code != tc.code || stdout != tc.stdout || stderr != tc.stderr {
				t.Fatalf("exit %d stdout %q stderr %q", code, stdout, stderr)
			}
		})
	}
	var audited int
	if err := db.QueryRowContext(ctx, `SELECT count(*) FROM identity.security_events WHERE metadata->>'source'='cli'`).Scan(&audited); err != nil || audited != 6 {
		t.Fatalf("cli audit events %d err=%v", audited, err)
	}
}
