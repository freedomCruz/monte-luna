package shipping

import (
	"errors"
	"net/http"

	"github.com/freedomCruz/monte-luna/backend/internal/identity"
	"github.com/freedomCruz/monte-luna/backend/internal/shipping/adapters"
)

// RegisterAdminRoutes requires the identity-owned SCS middleware and live access
// checker. Initialize fulfillment first; never expose an unprotected fallback.
func (m *Module) RegisterAdminRoutes(mux *http.ServeMux, access identity.AccessChecker, sessions func(http.Handler) http.Handler) error {
	if mux == nil || sessions == nil {
		return errors.New("admin dispatch route dependencies are required")
	}
	handler, err := adapters.NewFulfillmentHTTP(m.dispatch, access)
	if err != nil {
		return err
	}
	handler.RegisterRoutes(mux, sessions)
	return nil
}
