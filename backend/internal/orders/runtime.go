package orders

import (
	"context"
	"errors"
	"log/slog"
	"time"

	"github.com/freedomCruz/monte-luna/backend/internal/invoicing"
	"github.com/freedomCruz/monte-luna/backend/internal/orders/adapters"
	"github.com/freedomCruz/monte-luna/backend/internal/orders/adapters/postgres"
	"github.com/freedomCruz/monte-luna/backend/internal/orders/app"
	"github.com/freedomCruz/monte-luna/backend/internal/orders/domain"
	"github.com/freedomCruz/monte-luna/backend/internal/shipping"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Clock = domain.Clock
type OrderNumbers = domain.OrderNumbers
type CatalogStore interface {
	CatalogReader
	adapters.CatalogInventory
}
type RuntimeOptions struct {
	Clock        Clock
	OrderNumbers OrderNumbers
}

func DecodeTrackingSecret(encoded string) ([]byte, error) {
	return adapters.DecodeTrackingSecret(encoded)
}
func NewRuntime(ctx context.Context, databaseURL string, catalog CatalogStore, ship shipping.QuotePort, tax invoicing.TaxCalculator, secret []byte, logger *slog.Logger, options RuntimeOptions) (*Module, error) {
	if len(secret) < 32 {
		return nil, errors.New("TRACKING_TOKEN_SECRET must contain at least 32 decoded bytes")
	}
	if logger == nil {
		logger = slog.Default()
	}
	startup, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()
	pool, err := pgxpool.New(startup, databaseURL)
	if err != nil {
		return nil, errors.New("could not initialize orders PostgreSQL pool using DATABASE_URL")
	}
	if err := pool.Ping(startup); err != nil {
		pool.Close()
		return nil, errors.New("could not connect orders PostgreSQL using DATABASE_URL")
	}
	clock := options.Clock
	if clock == nil {
		clock = adapters.SystemClock{}
	}
	numbers := options.OrderNumbers
	if numbers == nil {
		numbers = adapters.RandomOrderNumbers{}
	}
	gateways := adapters.Gateways{Catalog: catalog, Shipping: ship, Tax: tax}
	inventory := adapters.InventoryGateway{Catalog: catalog}
	repository := postgres.NewRepository(pool)
	quote := app.NewService(gateways, gateways, gateways)
	placement := app.NewPlacement(quote, repository, inventory, adapters.AddressGateway{}, clock, numbers, secret)
	module := &Module{http: adapters.NewHTTP(quote, logger), pool: pool, maintenance: app.NewMaintenance(repository, inventory, clock), logger: logger}
	module.http.EnablePlacement(placement, repository)
	return module, nil
}
func (m *Module) Close() {
	if m.pool != nil {
		m.pool.Close()
	}
}
func (m *Module) RunMaintenance(ctx context.Context) (int, error) {
	if m.maintenance == nil {
		return 0, errors.New("orders maintenance is not configured")
	}
	return m.maintenance.Run(ctx)
}

// RunJobs blocks until cancellation. Callers own the goroutine and must stop it
// before closing the module pool. Time of expiry is supplied by the injected clock.
func (m *Module) RunJobs(ctx context.Context, interval time.Duration) {
	if interval <= 0 {
		m.logger.Error("invalid orders maintenance interval")
		return
	}
	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	for {
		if _, err := m.RunMaintenance(ctx); err != nil && ctx.Err() == nil {
			m.logger.ErrorContext(ctx, "orders maintenance failed", "error", err)
		}
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
		}
	}
}
