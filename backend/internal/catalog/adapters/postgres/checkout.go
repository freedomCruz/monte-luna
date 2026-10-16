package postgres

import (
	"context"
	"encoding/json"
	"fmt"

	catalogsql "github.com/freedomCruz/monte-luna/backend/internal/catalog/adapters/postgres/sqlc"
	"github.com/freedomCruz/monte-luna/backend/internal/catalog/domain"
	"github.com/jackc/pgx/v5"
)

// CheckoutVariants reads stock, prices, lifecycle state and variant labels from
// one read-only repeatable-read snapshot. Missing IDs are omitted, never invented.
func (r *Repository) CheckoutVariants(ctx context.Context, ids []string) (result []domain.CheckoutVariant, err error) {
	tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.RepeatableRead, AccessMode: pgx.ReadOnly})
	if err != nil {
		return nil, fmt.Errorf("begin checkout catalog read: %w", err)
	}
	defer rollback(ctx, tx, &err)
	q := catalogsql.New(tx)
	rows, err := q.ReadCheckoutVariants(ctx, ids)
	if err != nil {
		return nil, fmt.Errorf("read checkout variants: %w", err)
	}
	types := make([]string, 0, len(rows))
	for _, row := range rows {
		types = append(types, row.ProductTypeID)
	}
	definitions, err := q.ReadDefinitions(ctx, types)
	if err != nil {
		return nil, fmt.Errorf("read checkout variant definitions: %w", err)
	}
	byType := make(map[string][]domain.Definition)
	for _, row := range definitions {
		definition := domain.Definition{Key: row.Key, Label: row.Label, DataType: row.DataType, Scope: row.Scope, Unit: row.Unit, IsVariantOption: row.IsVariantOption}
		if len(row.AllowedValues) > 0 {
			if err := json.Unmarshal(row.AllowedValues, &definition.Allowed); err != nil {
				return nil, fmt.Errorf("decode checkout labels: %w", err)
			}
		}
		byType[row.ProductTypeID] = append(byType[row.ProductTypeID], definition)
	}
	result = make([]domain.CheckoutVariant, 0, len(rows))
	for _, row := range rows {
		values, err := object(row.Options)
		if err != nil {
			return nil, err
		}
		label, err := domain.VariantLabel(byType[row.ProductTypeID], values)
		if err != nil {
			return nil, err
		}
		result = append(result, domain.CheckoutVariant{ID: row.ID, ProductID: row.ProductID, ProductSlug: row.Slug, ProductTitle: row.Title, VariantLabel: label, SKU: row.Sku, ProductStatus: row.ProductStatus, Status: row.Status, PriceAmount: row.PriceAmount, Currency: row.Currency, WeightGrams: row.WeightGrams, TaxCategory: row.TaxCategory, AvailableStock: row.AvailableStock})
	}
	return result, nil
}
