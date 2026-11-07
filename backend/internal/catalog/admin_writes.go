package catalog

import (
	"errors"
	"github.com/freedomCruz/monte-luna/backend/internal/catalog/adapters"
	"github.com/freedomCruz/monte-luna/backend/internal/catalog/adapters/postgres"
	"github.com/freedomCruz/monte-luna/backend/internal/catalog/app"
	"github.com/freedomCruz/monte-luna/backend/internal/identity"
	"net/http"
)

// RegisterAdminWriteRoutes uses the same identity session policy as catalog reads.
func (m *Module) RegisterAdminWriteRoutes(mux *http.ServeMux, access identity.AccessChecker, sessions func(http.Handler) http.Handler) error {
	if mux == nil || sessions == nil || m.pool == nil {
		return errors.New("catalog write route dependencies are required")
	}
	handler, err := adapters.NewAdminWriteHTTP(app.NewAdminWrites(postgres.NewRepository(m.pool), m.media), access)
	if err != nil {
		return err
	}
	handler.RegisterRoutes(mux, sessions)
	return nil
}
