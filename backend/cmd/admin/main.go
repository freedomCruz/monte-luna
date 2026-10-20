// Command admin runs SSH-only administrator bootstrap and recovery commands.
// Passwords are read from stdin only; nothing secret is accepted as an argument.
package main

import (
	"context"
	"fmt"
	"io"
	"log/slog"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/freedomCruz/monte-luna/backend/internal/catalog"
	"github.com/freedomCruz/monte-luna/backend/internal/identity"
)

func main() {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	code := run(ctx, os.Args[1:], os.Stdin, os.Stdout, os.Stderr, os.Getenv)
	stop()
	os.Exit(code)
}

// run validates configuration exactly like cmd/api. Errors name variables but
// never print their values.
func run(ctx context.Context, args []string, stdin io.Reader, stdout, stderr io.Writer, getenv func(string) string) int {
	if len(args) == 1 && (args[0] == "--help" || args[0] == "-h") {
		if _, err := io.WriteString(stdout, identity.CLIUsage); err != nil {
			return 1
		}
		return 0
	}
	databaseURL := getenv("DATABASE_URL")
	if err := catalog.ValidateDatabaseURL(databaseURL); err != nil {
		return fail(stderr, err)
	}
	cfg, err := identity.LoadConfig(getenv)
	if err != nil {
		return fail(stderr, err)
	}
	ctx, cancel := context.WithTimeout(ctx, 2*time.Minute)
	defer cancel()
	module, err := identity.New(ctx, databaseURL, cfg, slog.New(slog.NewJSONHandler(stderr, nil)), identity.Options{})
	if err != nil {
		return fail(stderr, err)
	}
	defer module.Close()
	return module.RunCLI(ctx, args, stdin, stdout, stderr)
}

func fail(stderr io.Writer, err error) int {
	_, _ = fmt.Fprintln(stderr, err.Error())
	return 1
}
