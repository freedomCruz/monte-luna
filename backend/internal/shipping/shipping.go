// Package shipping is the module's only public, in-process surface.
// No shipping HTTP routes are exposed in this wave.
package shipping

import (
	"context"
	"database/sql"
	"errors"
	"time"

	"github.com/freedomCruz/monte-luna/backend/internal/shipping/adapters/postgres"
	"github.com/freedomCruz/monte-luna/backend/internal/shipping/app"
	"github.com/freedomCruz/monte-luna/backend/internal/shipping/domain"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Public value types and typed errors are stable inputs for consumer-side ports.
type QuoteInput = domain.QuoteInput
type Quote = domain.Quote
type Municipality = domain.Municipality
type UnsupportedDestinationError = domain.UnsupportedDestinationError
type UnknownMunicipalityError = domain.UnknownMunicipalityError

type QuotePort interface {
	Quote(context.Context, QuoteInput) (Quote, error)
}

type Module struct {
	pool      *pgxpool.Pool
	service   *app.Service
	reference *domain.Reference
}

var _ QuotePort = (*Module)(nil)

func New(ctx context.Context, databaseURL string) (*Module, error) {
	if databaseURL == "" {
		return nil, errors.New("DATABASE_URL is required")
	}
	startup, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()
	pool, err := pgxpool.New(startup, databaseURL)
	if err != nil {
		return nil, errors.New("could not initialize shipping PostgreSQL pool using DATABASE_URL")
	}
	if err := pool.Ping(startup); err != nil {
		pool.Close()
		return nil, errors.New("could not connect shipping PostgreSQL using DATABASE_URL")
	}
	reference := domain.NewReference()
	return &Module{pool: pool, reference: reference, service: app.NewService(postgres.NewRepository(pool), reference)}, nil
}
func (m *Module) Close() { m.pool.Close() }
func (m *Module) Quote(ctx context.Context, input QuoteInput) (Quote, error) {
	return m.service.Quote(ctx, input)
}
func (m *Module) LookupMunicipality(code string) (Municipality, error) {
	return m.reference.Lookup(code)
}

// LookupMunicipality validates addresses without requiring a database connection.
func LookupMunicipality(code string) (Municipality, error) { return domain.NewReference().Lookup(code) }
func Migrate(ctx context.Context, db *sql.DB) error        { return postgres.Migrate(ctx, db) }
func Seed(ctx context.Context, db *sql.DB) error           { return postgres.Seed(ctx, db) }
