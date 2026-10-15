package postgres

import (
	"context"
	"errors"
	"fmt"

	shippingsql "github.com/freedomCruz/monte-luna/backend/internal/shipping/adapters/postgres/sqlc"
	"github.com/freedomCruz/monte-luna/backend/internal/shipping/domain"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Repository struct {
	pool      *pgxpool.Pool
	reference *domain.Reference
}

func NewRepository(pool *pgxpool.Pool) *Repository {
	return &Repository{pool: pool, reference: domain.NewReference()}
}
func (r *Repository) FindZone(ctx context.Context, code string) (string, error) {
	id, err := shippingsql.New(r.pool).FindZone(ctx, code)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", &domain.UnsupportedDestinationError{}
	}
	if err != nil {
		return "", fmt.Errorf("find shipping zone: %w", err)
	}
	return id, nil
}
func (r *Repository) ListRates(ctx context.Context, zone string) ([]domain.Rate, error) {
	return listRates(ctx, shippingsql.New(r.pool), zone)
}
func listRates(ctx context.Context, q *shippingsql.Queries, zone string) ([]domain.Rate, error) {
	rows, err := q.ListRates(ctx, zone)
	if err != nil {
		return nil, fmt.Errorf("list shipping rates: %w", err)
	}
	rates := make([]domain.Rate, 0, len(rows))
	for _, row := range rows {
		rates = append(rates, domain.Rate{ID: row.ID, ZoneID: row.ZoneID, Name: row.Name, Currency: row.Currency, PriceAmount: row.PriceAmount, MinWeightGrams: row.MinWeightGrams, MaxWeightGrams: row.MaxWeightGrams, FreeShippingThresholdAmount: row.FreeShippingThresholdAmount, EstimatedDaysMin: row.EstimatedDaysMin, EstimatedDaysMax: row.EstimatedDaysMax, Status: row.Status})
	}
	return rates, nil
}

// AddArea is the write boundary for geographic coverage, including department-only areas.
func (r *Repository) AddArea(ctx context.Context, zone, department string, municipality *string) error {
	if err := r.reference.ValidateArea(department, municipality); err != nil {
		return err
	}
	if err := shippingsql.New(r.pool).InsertArea(ctx, shippingsql.InsertAreaParams{ZoneID: zone, DepartmentCode: department, MunicipalityCode: municipality}); err != nil {
		return fmt.Errorf("insert shipping area: %w", err)
	}
	return nil
}

// CreateRate validates against persisted bands under a zone row lock. All rate
// writers must take this lock, so independent inserts cannot race validation.
func (r *Repository) CreateRate(ctx context.Context, rate domain.Rate) (id string, err error) {
	// Inserts always receive a fresh database UUID; never skip a persisted band
	// because the caller supplied its ID (the update validator supports self-exclusion).
	rate.ID = ""
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return "", fmt.Errorf("begin shipping rate: %w", err)
	}
	defer func() {
		if e := tx.Rollback(ctx); e != nil && !errors.Is(e, pgx.ErrTxClosed) {
			err = errors.Join(err, e)
		}
	}()
	var zone string
	if err := tx.QueryRow(ctx, `SELECT id FROM shipping.shipping_zones WHERE id=$1 FOR UPDATE`, rate.ZoneID).Scan(&zone); err != nil {
		return "", fmt.Errorf("lock shipping zone: %w", err)
	}
	q := shippingsql.New(tx)
	existing, err := listRates(ctx, q, zone)
	if err != nil {
		return "", err
	}
	if err := domain.ValidateRate(rate, existing); err != nil {
		return "", err
	}
	id, err = q.InsertRate(ctx, shippingsql.InsertRateParams{ZoneID: rate.ZoneID, Name: rate.Name, PriceAmount: rate.PriceAmount, Currency: rate.Currency, MinWeightGrams: rate.MinWeightGrams, MaxWeightGrams: rate.MaxWeightGrams, FreeShippingThresholdAmount: rate.FreeShippingThresholdAmount, EstimatedDaysMin: rate.EstimatedDaysMin, EstimatedDaysMax: rate.EstimatedDaysMax, Status: rate.Status})
	if err != nil {
		return "", fmt.Errorf("insert shipping rate: %w", err)
	}
	if err := tx.Commit(ctx); err != nil {
		return "", fmt.Errorf("commit shipping rate: %w", err)
	}
	return id, nil
}
