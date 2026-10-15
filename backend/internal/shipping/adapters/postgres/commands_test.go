package postgres_test

import (
	"bytes"
	"encoding/json"
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

func buildCommand(t *testing.T, name string) string {
	t.Helper()
	binary := filepath.Join(t.TempDir(), name+".exe")
	cmd := exec.CommandContext(t.Context(), "go", "build", "-o", binary, "./cmd/"+name)
	cmd.Dir = filepath.Join("..", "..", "..", "..")
	if out, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("build %s: %v\n%s", name, err, out)
	}
	return binary
}
func command(t *testing.T, binary, url string, args ...string) (int, string, string) {
	t.Helper()
	cmd := exec.CommandContext(t.Context(), binary, args...)
	for _, entry := range os.Environ() {
		if !strings.HasPrefix(strings.ToUpper(entry), "DATABASE_URL=") {
			cmd.Env = append(cmd.Env, entry)
		}
	}
	cmd.Env = append(cmd.Env, "DATABASE_URL="+url)
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	code := 0
	if err := cmd.Run(); err != nil {
		var exit *exec.ExitError
		if !errors.As(err, &exit) {
			t.Fatal(err)
		}
		code = exit.ExitCode()
	}
	return code, stdout.String(), stderr.String()
}
func assertLog(t *testing.T, code int, stdout, stderr, msg, errorText string) {
	t.Helper()
	expected := 0
	level := "INFO"
	if errorText != "" {
		expected = 1
		level = "ERROR"
	}
	if code != expected || stdout != "" {
		t.Fatalf("exit/stdout=%d/%q; stderr=%s", code, stdout, stderr)
	}
	var record map[string]any
	if err := json.Unmarshal([]byte(stderr), &record); err != nil {
		t.Fatal(err)
	}
	if record["level"] != level || record["msg"] != msg {
		t.Fatalf("log=%v", record)
	}
	if errorText != "" && record["error"] != errorText {
		t.Fatalf("error=%v want %s", record["error"], errorText)
	}
	if errorText == "" && record["error"] != nil {
		t.Fatalf("unexpected error=%v", record["error"])
	}
}
func TestOrdersModuleFilter(t *testing.T) {
	db, url := database(t)
	migrate, seed := buildCommand(t, "migrate"), buildCommand(t, "seed")
	code, out, errout := command(t, migrate, url, "-module", "orders")
	assertLog(t, code, out, errout, "orders migrations applied", "")
	for range 2 {
		code, out, errout = command(t, seed, url, "-module", "orders")
		assertLog(t, code, out, errout, "demo orders seeded", "")
	}
	if scalar[int](t, db, `SELECT count(*) FROM orders.orders`) != 0 || scalar[int](t, db, `SELECT count(*) FROM orders.outbox`) != 0 {
		t.Fatal("orders seed wrote data")
	}
	for _, table := range []string{"catalog.goose_db_version", "shipping.goose_db_version"} {
		if scalar[bool](t, db, `SELECT to_regclass($1) IS NOT NULL`, table) {
			t.Fatalf("orders filter touched %s", table)
		}
	}
}

func TestShippingCommands(t *testing.T) {
	db, url := database(t)
	migrate, seed := buildCommand(t, "migrate"), buildCommand(t, "seed")
	for _, tc := range []struct{ binary, name, success, failure, help string }{
		{migrate, "migrate", "shipping migrations applied", "shipping migration failed", "Usage: migrate\nApply embedded migrations in order: catalog, shipping, orders (no demo data).\nEnvironment: DATABASE_URL is required.\nOptions: -module all|catalog|shipping|orders (default all).\n"},
		{seed, "seed", "demo shipping seeded", "demo shipping seed failed", "Usage: seed\nLoad idempotent demo data in order: catalog, shipping, orders, into an already migrated development database.\nNever run against production. Existing rows, prices and stock are not reset.\nEnvironment: DATABASE_URL is required.\nOptions: -module all|catalog|shipping|orders (default all).\n"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			code, out, errout := command(t, tc.binary, "", "-module", "shipping")
			assertLog(t, code, out, errout, tc.failure, "DATABASE_URL is required")
			code, out, errout = command(t, tc.binary, "", "-module", "unknown")
			failure := "unknown migration failed"
			if tc.name == "seed" {
				failure = "demo unknown seed failed"
			}
			assertLog(t, code, out, errout, failure, "module must be all, catalog, shipping or orders")
			code, out, errout = command(t, tc.binary, "", "-h")
			if code != 0 || out != "" || errout != tc.help {
				t.Fatalf("help exit/stdout/stderr = %d/%q/%q", code, out, errout)
			}
			for range 2 {
				code, out, errout = command(t, tc.binary, url, "-module", "shipping")
				assertLog(t, code, out, errout, tc.success, "")
			}
			if tc.name == "migrate" && scalar[int](t, db, `SELECT count(*) FROM shipping.shipping_zones`) != 0 {
				t.Fatal("migrate inserted demo data")
			}
			if scalar[bool](t, db, `SELECT to_regclass('catalog.goose_db_version') IS NOT NULL`) {
				t.Fatal("shipping command touched catalog schema")
			}
		})
	}
	before := snapshot(t, db)
	code, out, errout := command(t, seed, url, "-module", "unknown")
	assertLog(t, code, out, errout, "demo unknown seed failed", "module must be all, catalog, shipping or orders")
	if snapshot(t, db) != before {
		t.Fatal("rejected module changed stored data")
	}
}
