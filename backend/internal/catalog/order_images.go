package catalog

import (
	"context"
	"github.com/freedomCruz/monte-luna/backend/internal/catalog/adapters/postgres"
)

// OrderImages resolves live images without requiring historical products to
// remain published. A missing image has no map entry, never an invented URL.
func (m *Module) OrderImages(ctx context.Context, ids []string) (map[string]string, error) {
	keys, err := postgres.NewRepository(m.pool).OrderImageKeys(ctx, ids)
	if err != nil {
		return nil, err
	}
	result := make(map[string]string, len(keys))
	for id, key := range keys {
		resolved, err := m.media.Resolve(ctx, key)
		if err != nil {
			return nil, err
		}
		result[id] = resolved
	}
	return result, nil
}
