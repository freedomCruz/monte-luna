// Command migrate applies embedded module migrations. It never loads demo data.
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
	"github.com/freedomCruz/monte-luna/backend/internal/identity"
	"github.com/freedomCruz/monte-luna/backend/internal/notifications"
	"github.com/freedomCruz/monte-luna/backend/internal/orders"
	"github.com/freedomCruz/monte-luna/backend/internal/payments"
	"github.com/freedomCruz/monte-luna/backend/internal/shipping"
)

func main() {
	flags := flag.NewFlagSet("migrate", flag.ContinueOnError)
	module := flags.String("module", "all", "module to migrate: all, catalog, shipping, orders, payments, identity or notifications")
	flags.Usage = func() {
		if _, err := fmt.Fprint(flags.Output(), "Usage: migrate\nApply embedded migrations in order: catalog, shipping, orders, payments, identity, notifications (no demo data).\nEnvironment: DATABASE_URL is required.\nOptions: -module all|catalog|shipping|orders|payments|identity|notifications (default all).\n"); err != nil {
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
		label = "catalog, shipping, orders, payments, identity and notifications"
	}
	if err := runModule(ctx, *module); err != nil {
		logger.Error(label+" migration failed", "error", err)
		os.Exit(1)
	}
	logger.Info(label + " migrations applied")
}

func runModule(ctx context.Context, module string) (err error) {
	if module != "all" && module != "catalog" && module != "shipping" && module != "orders" && module != "payments" && module != "identity" && module != "notifications" {
		return errors.New("module must be all, catalog, shipping, orders, payments, identity or notifications")
	}
	db, err := catalog.OpenDatabase(ctx, os.Getenv("DATABASE_URL"))
	if err != nil {
		return err
	}
	defer func() { err = errors.Join(err, db.Close()) }()
	if module == "all" || module == "catalog" {
		if err := catalog.Migrate(ctx, db); err != nil {
			return err
		}
	}
	if module == "all" || module == "shipping" {
		if err := shipping.Migrate(ctx, db); err != nil {
			return err
		}
	}
	if module == "all" || module == "orders" {
		if err := orders.Migrate(ctx, db); err != nil {
			return err
		}
	}
	if module == "all" || module == "payments" {
		if err := payments.Migrate(ctx, db); err != nil {
			return err
		}
	}
	if module == "all" || module == "identity" {
		if err := identity.Migrate(ctx, db); err != nil {
			return err
		}
	}
	if module == "all" || module == "notifications" {
		return notifications.Migrate(ctx, db)
	}
	return nil
}
