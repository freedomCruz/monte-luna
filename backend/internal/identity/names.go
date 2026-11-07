package identity

import (
	"context"
	"github.com/freedomCruz/monte-luna/backend/internal/identity/adapters/postgres"
)

// NameLookup is the safe batch attribution port. Missing IDs have no entry;
// disabled admins remain attributable. Callers own authorization; max 100 IDs.
type NameLookup interface {
	AdminNames(context.Context, []string) (map[string]string, error)
}

func (m *Module) AdminNames(ctx context.Context, ids []string) (map[string]string, error) {
	return postgres.NewRepository(m.pool).AdminNames(ctx, ids)
}
