package domain

import (
	"errors"
	"slices"
)

type StockRequest struct {
	VariantID string
	Quantity  int32
}
type StockLot struct {
	LotID, LotCode, ProductionDate string
	Quantity                       int32
}
type Allocation struct {
	VariantID, LotID, LotCode, ProductionDate string
	Quantity                                  int32
}
type InsufficientStockError struct{ VariantID string }

func (e *InsufficientStockError) Error() string { return "insufficient_stock" }

type VariantUnavailableError struct{ VariantID string }

func (e *VariantUnavailableError) Error() string { return "variant_unavailable" }
func PlanAllocation(variant string, quantity int32, lots []StockLot) ([]Allocation, error) {
	if quantity <= 0 {
		return nil, errors.New("allocation quantity must be positive")
	}
	ordered := slices.Clone(lots)
	slices.SortFunc(ordered, func(a, b StockLot) int {
		if a.ProductionDate < b.ProductionDate {
			return -1
		}
		if a.ProductionDate > b.ProductionDate {
			return 1
		}
		if a.LotID < b.LotID {
			return -1
		}
		if a.LotID > b.LotID {
			return 1
		}
		return 0
	})
	remaining := quantity
	result := make([]Allocation, 0)
	for _, lot := range ordered {
		if remaining == 0 {
			break
		}
		take := min(remaining, lot.Quantity)
		if take <= 0 {
			continue
		}
		result = append(result, Allocation{VariantID: variant, LotID: lot.LotID, LotCode: lot.LotCode, ProductionDate: lot.ProductionDate, Quantity: take})
		remaining -= take
	}
	if remaining > 0 {
		return nil, &InsufficientStockError{VariantID: variant}
	}
	return result, nil
}
