// Command migrate applies embedded catalog migrations. It never loads demo data.
package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"log/slog"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/freedomCruz/monte-luna/backend/internal/catalog"
)

func main() {
	flags := flag.NewFlagSet("migrate", flag.ContinueOnError)
	flags.Usage = func() {
		if _, err := fmt.Fprint(flags.Output(), "Usage: migrate\nApply embedded catalog migrations (no demo data).\nEnvironment: DATABASE_URL is required.\n"); err != nil {
			os.Exit(1)
		}
	}
	if err := flags.Parse(os.Args[1:]); err != nil {
		if errors.Is(err, flag.ErrHelp) {
			return
		}
		os.Exit(2)
	}
	logger := slog.New(slog.NewJSONHandler(os.Stderr, nil))
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	ctx, cancel := context.WithTimeout(ctx, 2*time.Minute)
	defer cancel()
	if err := run(ctx); err != nil {
		logger.Error("catalog migration failed", "error", err)
		os.Exit(1)
	}
	logger.Info("catalog migrations applied")
}

func run(ctx context.Context) (err error) {
	db, err := catalog.OpenDatabase(ctx, os.Getenv("DATABASE_URL"))
	if err != nil {
		return err
	}
	defer func() { err = errors.Join(err, db.Close()) }()
	return catalog.Migrate(ctx, db)
}
