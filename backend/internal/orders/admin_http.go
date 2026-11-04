package orders

import (
	"errors"
	"github.com/freedomCruz/monte-luna/backend/internal/identity"
	"github.com/freedomCruz/monte-luna/backend/internal/orders/adapters"
	"net/http"
)

// RegisterAdminReadRoutes requires the identity-owned session middleware; the
// adapter rechecks full authentication/role for each private data request.
func (m *Module) RegisterAdminReadRoutes(mux *http.ServeMux, access identity.AccessChecker, sessions func(http.Handler) http.Handler) error {
	if mux == nil || sessions == nil {
		return errors.New("orders admin route dependencies required")
	}
	handler, err := adapters.NewAdminReadHTTP(m.adminReads, access)
	if err != nil {
		return err
	}
	handler.RegisterRoutes(mux, sessions)
	return nil
}
