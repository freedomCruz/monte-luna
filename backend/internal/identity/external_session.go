package identity

import (
	"net/http"

	"github.com/freedomCruz/monte-luna/backend/internal/identity/domain"
)

// Public authorization errors let other adapters distinguish 401/403 from
// persistence failures, without importing identity's private domain package.
var (
	ErrAuthenticationRequired = domain.ErrAuthenticationRequired
	ErrForbidden              = domain.ErrForbidden
)

// LoadAdminSession binds the existing SCS manager to another module's handler.
// It does not authorize: the handler must call Access().Require on each request.
// The receiving module owns CSRF, no-store and its RFC 9457 response mapping.
func (m *Module) LoadAdminSession(next http.Handler) http.Handler {
	return m.http.Sessions.Manager.LoadAndSave(next)
}
