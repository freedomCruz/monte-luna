// Command api runs the Monteluna HTTP API.
package main

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/freedomCruz/monte-luna/backend/internal/catalog"
	"github.com/freedomCruz/monte-luna/backend/internal/invoicing"
	"github.com/freedomCruz/monte-luna/backend/internal/notifications"
	"github.com/freedomCruz/monte-luna/backend/internal/orders"
	"github.com/freedomCruz/monte-luna/backend/internal/payments"
	"github.com/freedomCruz/monte-luna/backend/internal/platform"
	"github.com/freedomCruz/monte-luna/backend/internal/shipping"
	"github.com/jackc/pgx/v5/pgxpool"
)

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))
	if err := run(logger); err != nil {
		logger.Error("api stopped", "error", err)
		os.Exit(1)
	}
}

// run validates configuration, serves HTTP, and shuts down gracefully on
// SIGINT or SIGTERM.
func run(logger *slog.Logger) error {
	cfg, err := loadConfig()
	if err != nil {
		return err
	}
	addr := cfg.addr
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	module, err := catalog.New(ctx, cfg.databaseURL, cfg.mediaBaseURL, logger)
	if err != nil {
		return err
	}
	defer module.Close()
	ship, err := shipping.New(ctx, cfg.databaseURL)
	if err != nil {
		return err
	}
	defer ship.Close()
	tax, err := invoicing.NewDemo()
	if err != nil {
		return err
	}
	checkout, err := orders.NewRuntime(ctx, cfg.databaseURL, module, ship, tax, cfg.trackingSecret, logger, orders.RuntimeOptions{})
	if err != nil {
		return err
	}
	defer checkout.Close()
	payment, err := payments.New(ctx, cfg.databaseURL, payments.NewOrdersPort(checkout), cfg.payments, logger, payments.Options{})
	if err != nil {
		return err
	}
	defer payment.Close()
	checkout.EnablePayments(orderPayments{module: payment})
	notify, err := notifications.New(ctx, cfg.databaseURL, cfg.notifications, logger, notifications.Options{})
	if err != nil {
		return err
	}
	defer notify.Close()
	logger.Info("notifications email sender selected", "sender", cfg.notifications.Sender)
	relayPool, err := pgxpool.New(ctx, cfg.databaseURL)
	if err != nil {
		return errors.New("initialize outbox connection pool")
	}
	defer relayPool.Close()
	relay, err := platform.NewRelay(relayPool, []string{"catalog", "orders", "payments"}, cfg.relay, logger)
	if err != nil {
		return err
	}
	relay.Subscribe("payments.payment_approved", checkout.HandlePaymentApproved)
	relay.Subscribe("orders.order_cancelled", payment.HandleOrderCancelled)
	relayCtx, cancelRelay := context.WithCancel(ctx)
	relayDone := make(chan struct{})
	go func() { defer close(relayDone); relay.Run(relayCtx) }()
	defer func() { cancelRelay(); <-relayDone }()
	paymentJobsCtx, cancelPaymentJobs := context.WithCancel(ctx)
	paymentJobsDone := make(chan struct{})
	go func() { defer close(paymentJobsDone); payment.RunJobs(paymentJobsCtx, cfg.relay.CleanupInterval) }()
	defer func() { cancelPaymentJobs(); <-paymentJobsDone }()
	jobsCtx, cancelJobs := context.WithCancel(ctx)
	jobsDone := make(chan struct{})
	go func() { defer close(jobsDone); checkout.RunJobs(jobsCtx, cfg.maintenanceInterval) }()
	defer func() { cancelJobs(); <-jobsDone }()
	notifyJobsCtx, cancelNotifyJobs := context.WithCancel(ctx)
	notifyJobsDone := make(chan struct{})
	go func() { defer close(notifyJobsDone); notify.RunJobs(notifyJobsCtx, cfg.notifications.CleanupInterval) }()
	defer func() { cancelNotifyJobs(); <-notifyJobsDone }()

	mux := http.NewServeMux()
	platform.RegisterRoutes(mux)
	module.RegisterRoutes(mux)
	checkout.RegisterRoutes(mux)
	payment.RegisterRoutes(mux)
	notify.RegisterRoutes(mux)

	srv := &http.Server{
		Addr:              addr,
		Handler:           mux,
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       15 * time.Second,
		WriteTimeout:      15 * time.Second,
		IdleTimeout:       60 * time.Second,
	}

	errCh := make(chan error, 1)
	go func() {
		logger.Info("api listening", "addr", addr)
		errCh <- srv.ListenAndServe()
	}()

	select {
	case err := <-errCh:
		if errors.Is(err, http.ErrServerClosed) {
			return nil
		}
		return fmt.Errorf("listen: %w", err)
	case <-ctx.Done():
	}

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := srv.Shutdown(shutdownCtx); err != nil {
		return fmt.Errorf("shutdown: %w", err)
	}
	logger.Info("api stopped cleanly")
	return nil
}

type config struct {
	addr, databaseURL, mediaBaseURL string
	trackingSecret                  []byte
	maintenanceInterval             time.Duration
	relay                           platform.RelayConfig
	payments                        payments.Config
	notifications                   notifications.Config
}

func loadConfig() (config, error) {
	cfg := config{addr: os.Getenv("API_ADDR"), databaseURL: os.Getenv("DATABASE_URL"), mediaBaseURL: os.Getenv("MEDIA_BASE_URL")}
	if cfg.addr == "" {
		return cfg, errors.New("API_ADDR is required (for example 127.0.0.1:8080)")
	}
	if err := catalog.ValidateDatabaseURL(cfg.databaseURL); err != nil {
		return cfg, err
	}
	if err := catalog.ValidateMediaBaseURL(cfg.mediaBaseURL); err != nil {
		return cfg, err
	}
	secret, err := orders.DecodeTrackingSecret(os.Getenv("TRACKING_TOKEN_SECRET"))
	if err != nil {
		return cfg, err
	}
	cfg.trackingSecret = secret
	cfg.maintenanceInterval = time.Minute
	if value := os.Getenv("ORDER_MAINTENANCE_INTERVAL"); value != "" {
		interval, err := time.ParseDuration(value)
		if err != nil || interval <= 0 {
			return cfg, errors.New("ORDER_MAINTENANCE_INTERVAL must be a positive duration")
		}
		cfg.maintenanceInterval = interval
	}
	cfg.payments, err = payments.LoadConfig(os.Getenv)
	if err != nil {
		return cfg, err
	}
	cfg.notifications, err = notifications.LoadConfig(os.Getenv)
	if err != nil {
		return cfg, err
	}
	cfg.relay, err = platform.LoadRelayConfig(os.Getenv)
	if err != nil {
		return cfg, err
	}
	return cfg, nil
}
