// Command seed loads fictional module data into an already migrated development database.
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
	"github.com/freedomCruz/monte-luna/backend/internal/shipping"
)

func main() {
	flags := flag.NewFlagSet("seed", flag.ContinueOnError)
	module := flags.String("module", "all", "module to seed: all, catalog or shipping")
	flags.Usage = func() {
		if _, err := fmt.Fprint(flags.Output(), "Usage: seed\nLoad idempotent demo data in order: catalog, shipping, into an already migrated development database.\nNever run against production. Existing rows, prices and stock are not reset.\nEnvironment: DATABASE_URL is required.\nOptions: -module all|catalog|shipping (default all).\n"); err != nil {
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
	label := *module
	if label == "all" {
		label = "catalog and shipping"
	}
	if err := runModule(ctx, *module); err != nil {
		logger.Error("demo "+label+" seed failed", "error", err)
		os.Exit(1)
	}
	logger.Info("demo " + label + " seeded")
}

func runModule(ctx context.Context, module string) (err error) {
	if module != "all" && module != "catalog" && module != "shipping" {
		return errors.New("module must be all, catalog or shipping")
	}
	db, err := catalog.OpenDatabase(ctx, os.Getenv("DATABASE_URL"))
	if err != nil {
		return err
	}
	defer func() { err = errors.Join(err, db.Close()) }()
	if module == "all" || module == "catalog" {
		if err := catalog.Seed(ctx, db); err != nil {
			return err
		}
	}
	if module == "all" || module == "shipping" {
		return shipping.Seed(ctx, db)
	}
	return nil
}
