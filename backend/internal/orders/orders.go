// Package orders is the only public surface of the checkout module.
package orders

import (
	"context"
	"database/sql"
	"log/slog"
	"net/http"

	"github.com/freedomCruz/monte-luna/backend/internal/invoicing"
	"github.com/freedomCruz/monte-luna/backend/internal/orders/adapters"
	"github.com/freedomCruz/monte-luna/backend/internal/orders/adapters/postgres"
	"github.com/freedomCruz/monte-luna/backend/internal/orders/app"
	"github.com/freedomCruz/monte-luna/backend/internal/orders/domain"
	"github.com/freedomCruz/monte-luna/backend/internal/shipping"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Module struct {
	http        *adapters.HTTP
	pool        *pgxpool.Pool
	maintenance *app.Maintenance
	logger      *slog.Logger
	repository  *postgres.Repository
	inventory   domain.ReallocationPort
	clock       domain.Clock
}
type CatalogReader = adapters.CatalogReader

func New(catalog CatalogReader, shipping shipping.QuotePort, tax invoicing.TaxCalculator, logger *slog.Logger) *Module {
	gateways := adapters.Gateways{Catalog: catalog, Shipping: shipping, Tax: tax}
	return &Module{http: adapters.NewHTTP(app.NewService(gateways, gateways, gateways), logger)}
}
func (m *Module) RegisterRoutes(mux *http.ServeMux) { m.http.RegisterRoutes(mux) }
func Migrate(ctx context.Context, db *sql.DB) error { return postgres.Migrate(ctx, db) }
func Seed(ctx context.Context, db *sql.DB) error    { return postgres.Seed(ctx, db) }
