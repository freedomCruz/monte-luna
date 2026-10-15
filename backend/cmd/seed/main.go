// Command seed loads fictional catalog data into an already migrated development database.
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
	flags := flag.NewFlagSet("seed", flag.ContinueOnError)
	flags.Usage = func() {
		if _, err := fmt.Fprint(flags.Output(), "Usage: seed\nLoad idempotent demo catalog data into an already migrated development database.\nNever run against production. Existing rows and stock are not reset.\nEnvironment: DATABASE_URL is required.\n"); err != nil {
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
		logger.Error("demo catalog seed failed", "error", err)
		os.Exit(1)
	}
	logger.Info("demo catalog seeded")
}

func run(ctx context.Context) (err error) {
	db, err := catalog.OpenDatabase(ctx, os.Getenv("DATABASE_URL"))
	if err != nil {
		return err
	}
	defer func() { err = errors.Join(err, db.Close()) }()
	return catalog.Seed(ctx, db)
}
