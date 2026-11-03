package postgres

import (
	"context"
	catalogsql "github.com/freedomCruz/monte-luna/backend/internal/catalog/adapters/postgres/sqlc"
)

func (r *Repository) OrderImageKeys(ctx context.Context, ids []string) (map[string]string, error) {
	result := make(map[string]string)
	rows, err := catalogsql.New(r.pool).ReadProductImages(ctx, ids)
	if err != nil {
		return nil, err
	}
	for _, row := range rows {
		if _, ok := result[row.ProductID]; !ok {
			result[row.ProductID] = row.StorageKey
		}
	}
	return result, nil
}
