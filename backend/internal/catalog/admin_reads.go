package catalog

import (
	"errors"
	"github.com/freedomCruz/monte-luna/backend/internal/catalog/adapters"
	"github.com/freedomCruz/monte-luna/backend/internal/catalog/adapters/postgres"
	"github.com/freedomCruz/monte-luna/backend/internal/catalog/app"
	"github.com/freedomCruz/monte-luna/backend/internal/catalog/domain"
	"github.com/freedomCruz/monte-luna/backend/internal/identity"
	"net/http"
	"time"
)

type AdminOrdersPort = domain.AdminOrdersPort
type HeldQuantity = domain.HeldQuantity
type AdminMovementOrder = domain.AdminMovementOrder

// RegisterAdminReadRoutes composes cross-module reads through safe public ports.
// Dependencies are configured once, before serving. A nil clock uses time.Now.
func (m *Module) RegisterAdminReadRoutes(mux *http.ServeMux, access identity.AccessChecker, sessions func(http.Handler) http.Handler, orders AdminOrdersPort, names identity.NameLookup, now func() time.Time) error {
	if mux == nil || sessions == nil || orders == nil || names == nil || m.pool == nil {
		return errors.New("catalog admin read dependencies are required")
	}
	if now == nil {
		now = time.Now
	}
	service := app.NewAdminReads(postgres.NewRepository(m.pool), m.media, orders, adapters.AdminNamesGateway{Port: names}, now)
	handler, err := adapters.NewAdminReadHTTP(service, access)
	if err != nil {
		return err
	}
	handler.RegisterRoutes(mux, sessions)
	return nil
}
