package postgres_test

import (
	"bytes"
	"encoding/json"
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

func buildCommand(t *testing.T, name string) string {
	t.Helper()
	_, file, _, _ := runtime.Caller(0)
	root := filepath.Join(filepath.Dir(file), "..", "..", "..", "..")
	binary := filepath.Join(t.TempDir(), name+".exe")
	cmd := exec.CommandContext(t.Context(), "go", "build", "-o", binary, "./cmd/"+name)
	cmd.Dir = root
	if out, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("build %s command: %v\n%s", name, err, out)
	}
	return binary
}

func command(t *testing.T, binary, url string, args ...string) (int, string, string) {
	t.Helper()
	cmd := exec.CommandContext(t.Context(), binary, args...)
	// Never read .env or inherit an actual DATABASE_URL into integration commands.
	for _, entry := range os.Environ() {
		if !strings.HasPrefix(strings.ToUpper(entry), "DATABASE_URL=") {
			cmd.Env = append(cmd.Env, entry)
		}
	}
	cmd.Env = append(cmd.Env, "DATABASE_URL="+url)
	var stdout, stderr bytes.Buffer
	cmd.Stdout, cmd.Stderr = &stdout, &stderr
	code := 0
	if err := cmd.Run(); err != nil {
		var exit *exec.ExitError
		if !errors.As(err, &exit) {
			t.Fatalf("execute command: %v", err)
		}
		code = exit.ExitCode()
	}
	return code, stdout.String(), stderr.String()
}

func assertLog(t *testing.T, code int, stdout, stderr, level, message, errorText string) {
	t.Helper()
	wantCode := 0
	if errorText != "" {
		wantCode = 1
	}
	if code != wantCode || stdout != "" {
		t.Fatalf("exit/stdout = %d/%q, want %d/empty; stderr=%s", code, stdout, wantCode, stderr)
	}
	var log map[string]any
	if err := json.Unmarshal([]byte(stderr), &log); err != nil {
		t.Fatalf("stderr is not one JSON slog record: %v: %s", err, stderr)
	}
	if log["level"] != level || log["msg"] != message {
		t.Fatalf("stderr level/msg = %v/%v, want %s/%s", log["level"], log["msg"], level, message)
	}
	if errorText != "" && log["error"] != errorText {
		t.Errorf("stderr error = %v, want %s", log["error"], errorText)
	}
	if errorText == "" && log["error"] != nil {
		t.Errorf("success logged an error: %v", log["error"])
	}
}

func TestCatalogModuleFilter(t *testing.T) {
	db, url := database(t)
	migrate, seed := buildCommand(t, "migrate"), buildCommand(t, "seed")
	code, out, errout := command(t, migrate, url, "-module", "catalog")
	assertLog(t, code, out, errout, "INFO", "catalog migrations applied", "")
	code, out, errout = command(t, seed, url, "-module", "catalog")
	assertLog(t, code, out, errout, "INFO", "demo catalog seeded", "")
	assertDemo(t, db)
	before := catalogSnapshot(t, db)
	code, out, errout = command(t, seed, url, "-module", "catalog")
	assertLog(t, code, out, errout, "INFO", "demo catalog seeded", "")
	assertSameCatalog(t, db, before)
	if scalar[bool](t, db, `SELECT to_regclass('shipping.goose_db_version') IS NOT NULL`) {
		t.Fatal("catalog filter touched shipping schema")
	}
}

func TestMigrateCommand(t *testing.T) {
	binary := buildCommand(t, "migrate")
	code, stdout, stderr := command(t, binary, "")
	assertLog(t, code, stdout, stderr, "ERROR", "catalog, shipping and orders migration failed", "DATABASE_URL is required")
	code, stdout, stderr = command(t, binary, "", "-h")
	wantHelp := "Usage: migrate\nApply embedded migrations in order: catalog, shipping, orders (no demo data).\nEnvironment: DATABASE_URL is required.\nOptions: -module all|catalog|shipping|orders (default all).\n"
	if code != 0 || stdout != "" || stderr != wantHelp {
		t.Fatalf("help exit/stdout/stderr = %d/%q/%q", code, stdout, stderr)
	}
	db, url := database(t)
	for range 2 {
		code, stdout, stderr = command(t, binary, url)
		assertLog(t, code, stdout, stderr, "INFO", "catalog, shipping and orders migrations applied", "")
	}
	if got := scalar[int](t, db, `SELECT count(*) FROM catalog.products`); got != 0 {
		t.Errorf("migrations loaded %d demo products", got)
	}
	if !scalar[bool](t, db, `SELECT to_regclass('catalog.goose_db_version') IS NOT NULL`) {
		t.Error("migrate command did not create catalog version table")
	}
	if !scalar[bool](t, db, `SELECT to_regclass('shipping.goose_db_version') IS NOT NULL`) {
		t.Error("default migrate command did not create shipping version table")
	}
	if scalar[int](t, db, `SELECT count(*) FROM shipping.shipping_zones`) != 0 {
		t.Error("migrations loaded demo shipping zones")
	}
	if !scalar[bool](t, db, `SELECT to_regclass('orders.goose_db_version') IS NOT NULL`) || scalar[int](t, db, `SELECT count(*) FROM orders.orders`) != 0 {
		t.Fatal("default migrate did not create empty orders schema")
	}
}
