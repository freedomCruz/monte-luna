// Package catalog is the module's only public surface. Consumers never import
// its domain, app, adapters, or generated SQL packages directly.
package catalog

import (
	"context"
	"database/sql"
	"errors"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/freedomCruz/monte-luna/backend/internal/catalog/adapters"
	"github.com/freedomCruz/monte-luna/backend/internal/catalog/adapters/postgres"
	"github.com/freedomCruz/monte-luna/backend/internal/catalog/app"
	"github.com/freedomCruz/monte-luna/backend/internal/catalog/domain"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Module struct {
	pool *pgxpool.Pool
	http *adapters.HTTP
}

func ValidateDatabaseURL(value string) error {
	if strings.TrimSpace(value) == "" {
		return errors.New("DATABASE_URL is required")
	}
	if _, err := pgxpool.ParseConfig(value); err != nil {
		return errors.New("DATABASE_URL must be a valid PostgreSQL connection string")
	}
	return nil
}
func ValidateMediaBaseURL(value string) error { _, err := adapters.NewMedia(value); return err }
func New(ctx context.Context, databaseURL, mediaBaseURL string, logger *slog.Logger) (*Module, error) {
	if err := ValidateDatabaseURL(databaseURL); err != nil {
		return nil, err
	}
	media, err := adapters.NewMedia(mediaBaseURL)
	if err != nil {
		return nil, err
	}
	startup, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()
	pool, err := pgxpool.New(startup, databaseURL)
	if err != nil {
		return nil, errors.New("could not initialize PostgreSQL pool using DATABASE_URL")
	}
	if err := pool.Ping(startup); err != nil {
		pool.Close()
		return nil, errors.New("could not connect to PostgreSQL using DATABASE_URL")
	}
	if logger == nil {
		logger = slog.Default()
	}
	service := app.NewService(postgres.NewRepository(pool), media)
	return &Module{pool: pool, http: adapters.NewHTTP(service, logger)}, nil
}

type CheckoutVariant = domain.CheckoutVariant
type StockRequest = domain.StockRequest
type Allocation = domain.Allocation
type InsufficientStockError = domain.InsufficientStockError
type VariantUnavailableError = domain.VariantUnavailableError

func (m *Module) Allocate(ctx context.Context, reference string, items []StockRequest) ([]Allocation, error) {
	return postgres.NewRepository(m.pool).Allocate(ctx, reference, items)
}
func (m *Module) Reallocate(ctx context.Context, reference string, items []StockRequest) ([]Allocation, error) {
	return postgres.NewRepository(m.pool).Reallocate(ctx, reference, items)
}
func (m *Module) Release(ctx context.Context, reference string) error {
	return postgres.NewRepository(m.pool).Release(ctx, reference)
}

// CheckoutVariants is the catalog's live, read-only in-process checkout port.
func (m *Module) CheckoutVariants(ctx context.Context, ids []string) ([]CheckoutVariant, error) {
	return postgres.NewRepository(m.pool).CheckoutVariants(ctx, ids)
}

func (m *Module) Close()                            { m.pool.Close() }
func (m *Module) RegisterRoutes(mux *http.ServeMux) { m.http.RegisterRoutes(mux) }

// Database maintenance is exposed through the root facade as well, so command
// entry points obey the same module boundary as other consumers.
func OpenDatabase(ctx context.Context, url string) (*sql.DB, error) { return postgres.Open(ctx, url) }
func Migrate(ctx context.Context, db *sql.DB) error                 { return postgres.Migrate(ctx, db) }
func Seed(ctx context.Context, db *sql.DB) error                    { return postgres.Seed(ctx, db) }
