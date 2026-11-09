package adapters

import (
	"context"
	"github.com/freedomCruz/monte-luna/backend/internal/identity"
)

type AdminNamesGateway struct{ Port identity.NameLookup }

func (g AdminNamesGateway) Names(ctx context.Context, ids []string) (map[string]string, error) {
	return g.Port.AdminNames(ctx, ids)
}
