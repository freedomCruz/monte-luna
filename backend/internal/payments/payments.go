// Package payments is the module's only public surface.
package payments

import (
	"context"
	"database/sql"
	"errors"
	"log/slog"
	"net/http"
	"time"

	"github.com/freedomCruz/monte-luna/backend/internal/payments/adapters"
	"github.com/freedomCruz/monte-luna/backend/internal/payments/adapters/postgres"
	"github.com/freedomCruz/monte-luna/backend/internal/payments/app"
	"github.com/freedomCruz/monte-luna/backend/internal/payments/domain"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Config = adapters.Config
type Order = domain.Order
type OrdersPort = domain.OrdersPort
type OrderReader = adapters.OrderReader

func NewOrdersPort(reader OrderReader) OrdersPort { return adapters.OrdersGateway{Reader: reader} }

type PaymentGateway = domain.PaymentGateway
type Transaction = domain.Transaction
type GuestPayment = domain.GuestPayment
type Options struct {
	Clock   domain.Clock
	Gateway PaymentGateway
}
type Module struct {
	pool           *pgxpool.Pool
	http           *adapters.HTTP
	clock          domain.Clock
	gateway        PaymentGateway
	repository     *postgres.Repository
	logger         *slog.Logger
	orders         OrdersPort
	config         Config
	reconciliation *app.Reconciliation
}

func LoadConfig(getenv func(string) string) (Config, error) { return adapters.LoadConfig(getenv) }
func OrderNotFound() error                                  { return domain.Problem(404, "order_not_found") }
func Migrate(ctx context.Context, db *sql.DB) error         { return postgres.Migrate(ctx, db) }

// Down is for disposable test databases only, never production operations.
func Down(ctx context.Context, db *sql.DB) error { return postgres.Down(ctx, db) }
func New(ctx context.Context, databaseURL string, orders OrdersPort, cfg Config, logger *slog.Logger, options Options) (*Module, error) {
	if err := cfg.Validate(); err != nil {
		return nil, err
	}
	if logger == nil {
		logger = slog.Default()
	}
	startup, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()
	pool, err := pgxpool.New(startup, databaseURL)
	if err != nil {
		return nil, errors.New("initialize payments PostgreSQL pool")
	}
	if err := pool.Ping(startup); err != nil {
		pool.Close()
		return nil, errors.New("connect payments PostgreSQL pool")
	}
	clock := options.Clock
	if clock == nil {
		clock = adapters.SystemClock{}
	}
	gateway := options.Gateway
	if gateway == nil {
		timeout := cfg.HTTPTimeout
		if timeout <= 0 {
			timeout = 10 * time.Second
		}
		gateway = adapters.NewWompi(cfg.GatewayURL(), cfg.PrivateKey, &http.Client{Timeout: timeout, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }})
	}
	repo := postgres.NewRepository(pool)
	start := app.NewStart(repo, orders, clock, adapters.RandomReferences{}, app.CheckoutConfig{PublicKey: cfg.PublicKey, IntegritySecret: cfg.IntegritySecret, StorefrontBaseURL: cfg.StorefrontBaseURL})
	reconciliation := app.NewReconciliation(repo, orders, gateway, clock)
	handler := adapters.NewHTTP(start, logger)
	handler.EnableReconciliation(reconciliation, cfg.EventsSecret)
	return &Module{pool: pool, http: handler, clock: clock, gateway: gateway, repository: repo, logger: logger, orders: orders, config: cfg, reconciliation: reconciliation}, nil
}
func (m *Module) RegisterRoutes(mux *http.ServeMux) { m.http.RegisterRoutes(mux) }
func (m *Module) Close()                            { m.pool.Close() }
