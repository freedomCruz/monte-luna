package adapters

import (
	"context"
	"errors"
	"github.com/freedomCruz/monte-luna/backend/internal/catalog"
	"github.com/freedomCruz/monte-luna/backend/internal/orders/domain"
)

func (g InventoryGateway) Reallocate(ctx context.Context, id string, items []domain.Item) ([]domain.Allocation, error) {
	reallocator, ok := g.Catalog.(interface {
		Reallocate(context.Context, string, []catalog.StockRequest) ([]catalog.Allocation, error)
	})
	if !ok {
		return nil, errors.New("catalog reallocation port is unavailable")
	}
	requests := make([]catalog.StockRequest, len(items))
	for i, item := range items {
		requests[i] = catalog.StockRequest{VariantID: item.VariantID, Quantity: item.Quantity}
	}
	rows, err := reallocator.Reallocate(ctx, id, requests)
	if err != nil {
		var shortage *catalog.InsufficientStockError
		var unavailable *catalog.VariantUnavailableError
		if errors.As(err, &shortage) || errors.As(err, &unavailable) {
			return nil, &domain.Error{Status: 409, Code: "insufficient_stock"}
		}
		return nil, err
	}
	result := make([]domain.Allocation, len(rows))
	for i, row := range rows {
		result[i] = domain.Allocation{VariantID: row.VariantID, LotID: row.LotID, LotCode: row.LotCode, ProductionDate: row.ProductionDate, Quantity: row.Quantity}
	}
	return result, nil
}
