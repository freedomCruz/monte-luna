package postgres

import (
	"context"
	"errors"
	"fmt"
	"math"
	"slices"

	catalogsql "github.com/freedomCruz/monte-luna/backend/internal/catalog/adapters/postgres/sqlc"
	"github.com/freedomCruz/monte-luna/backend/internal/catalog/domain"
	"github.com/jackc/pgx/v5"
)

// Allocate commits the complete cart allocation atomically, or writes nothing.
// Reference and ascending variant locks serialize duplicate/same-stock requests.
func (r *Repository) Allocate(ctx context.Context, reference string, items []domain.StockRequest) (result []domain.Allocation, err error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("begin allocation: %w", err)
	}
	defer rollback(ctx, tx, &err)
	q := catalogsql.New(tx)
	if err := q.LockAllocationReference(ctx, reference); err != nil {
		return nil, fmt.Errorf("lock allocation: %w", err)
	}
	existing, err := q.ReferenceMovements(ctx, &reference)
	if err != nil {
		return nil, fmt.Errorf("read allocation guard: %w", err)
	}
	if len(existing) > 0 {
		return nil, errors.New("allocation reference already used")
	}
	ordered := slices.Clone(items)
	slices.SortFunc(ordered, func(a, b domain.StockRequest) int {
		if a.VariantID < b.VariantID {
			return -1
		}
		if a.VariantID > b.VariantID {
			return 1
		}
		return 0
	})
	for i, item := range ordered {
		if item.Quantity <= 0 || (i > 0 && item.VariantID == ordered[i-1].VariantID) {
			return nil, errors.New("invalid allocation items")
		}
		variant, err := q.LockStockVariant(ctx, item.VariantID)
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, &domain.VariantUnavailableError{VariantID: item.VariantID}
		}
		if err != nil {
			return nil, fmt.Errorf("lock stock variant: %w", err)
		}
		if variant.Status != "active" || variant.ProductStatus != "published" {
			return nil, &domain.VariantUnavailableError{VariantID: item.VariantID}
		}
		rows, err := q.LockStockLots(ctx, item.VariantID)
		if err != nil {
			return nil, fmt.Errorf("lock stock lots: %w", err)
		}
		lots := make([]domain.StockLot, 0, len(rows))
		for _, row := range rows {
			lots = append(lots, domain.StockLot{LotID: row.LotID, LotCode: row.LotCode, ProductionDate: row.ProductionDate.Time.Format("2006-01-02"), Quantity: row.Quantity})
		}
		allocations, err := domain.PlanAllocation(item.VariantID, item.Quantity, lots)
		if err != nil {
			return nil, err
		}
		for _, allocation := range allocations {
			changed, err := q.DecrementStock(ctx, catalogsql.DecrementStockParams{VariantID: allocation.VariantID, LotID: allocation.LotID, Quantity: allocation.Quantity})
			if err != nil {
				return nil, fmt.Errorf("decrement stock: %w", err)
			}
			if changed != 1 {
				return nil, &domain.InsufficientStockError{VariantID: item.VariantID}
			}
			if err := q.InsertStockMovement(ctx, catalogsql.InsertStockMovementParams{VariantID: allocation.VariantID, LotID: allocation.LotID, QuantityDelta: -allocation.Quantity, Reason: "sale", ReferenceID: &reference}); err != nil {
				return nil, fmt.Errorf("record allocation: %w", err)
			}
		}
		result = append(result, allocations...)
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("commit allocation: %w", err)
	}
	return result, nil
}

// Release restores the outstanding net allocation by reference exactly once,
// including when multiple expiry/compensation processes overlap.
func (r *Repository) Release(ctx context.Context, reference string) (err error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin release: %w", err)
	}
	defer rollback(ctx, tx, &err)
	q := catalogsql.New(tx)
	if err := q.LockAllocationReference(ctx, reference); err != nil {
		return fmt.Errorf("lock release: %w", err)
	}
	rows, err := q.ReferenceMovements(ctx, &reference)
	if err != nil {
		return fmt.Errorf("read release movements: %w", err)
	}
	previous := ""
	for _, row := range rows {
		if row.Quantity >= 0 {
			continue
		}
		if row.VariantID != previous {
			if _, err := q.LockStockVariant(ctx, row.VariantID); err != nil {
				return fmt.Errorf("lock release variant: %w", err)
			}
			previous = row.VariantID
		}
		if row.Quantity < -math.MaxInt32 {
			return errors.New("release amount out of range")
		}
		quantity := int32(-row.Quantity)
		n, err := q.IncrementStock(ctx, catalogsql.IncrementStockParams{VariantID: row.VariantID, LotID: row.LotID, Quantity: quantity})
		if err != nil {
			return fmt.Errorf("restore stock: %w", err)
		}
		if n != 1 {
			return errors.New("release stock counter is missing")
		}
		if err := q.InsertStockMovement(ctx, catalogsql.InsertStockMovementParams{VariantID: row.VariantID, LotID: row.LotID, QuantityDelta: quantity, Reason: "release", ReferenceID: &reference}); err != nil {
			return fmt.Errorf("record release: %w", err)
		}
	}
	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit release: %w", err)
	}
	return nil
}
