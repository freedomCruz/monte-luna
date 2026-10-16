package postgres

import (
	"context"
	"database/sql"
	"errors"
	"fmt"

	"github.com/freedomCruz/monte-luna/backend/internal/shipping/domain"
)

// Seed inserts fictional development zones/rates in one transaction. Existing
// natural-key rows are preserved, including merchant-edited coverage and prices.
// All rate writers lock the zone before validating inclusive weight bands.
func Seed(ctx context.Context, db *sql.DB) (err error) {
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin shipping demo seed: %w", err)
	}
	defer func() {
		if e := tx.Rollback(); e != nil && !errors.Is(e, sql.ErrTxDone) {
			err = errors.Join(err, e)
		}
	}()
	reference := domain.NewReference()
	for _, fixture := range []struct {
		name, department string
		municipality     *string
		price            int64
	}{
		{"Demo Bogotá", "11", value("11001"), 800000},
		{"Demo Medellín", "05", value("05001"), 1000000},
		{"Demo Antioquia", "05", nil, 1500000},
	} {
		if err := reference.ValidateArea(fixture.department, fixture.municipality); err != nil {
			return err
		}
		if _, err := tx.ExecContext(ctx, `INSERT INTO shipping.shipping_zones(name) VALUES ($1) ON CONFLICT(name) DO NOTHING`, fixture.name); err != nil {
			return fmt.Errorf("seed shipping zone: %w", err)
		}
		var zone string
		if err := tx.QueryRowContext(ctx, `SELECT id FROM shipping.shipping_zones WHERE name=$1 FOR UPDATE`, fixture.name).Scan(&zone); err != nil {
			return fmt.Errorf("lock demo zone: %w", err)
		}
		if _, err := tx.ExecContext(ctx, `INSERT INTO shipping.shipping_zone_areas(zone_id,department_code,municipality_code) VALUES($1,$2,$3) ON CONFLICT DO NOTHING`, zone, fixture.department, fixture.municipality); err != nil {
			return fmt.Errorf("seed shipping area: %w", err)
		}
		for _, band := range []struct {
			name  string
			min   int32
			max   *int32
			extra int64
		}{
			{"Demo standard parcel", 0, value(int32(1000)), 0},
			{"Demo heavy parcel", 1001, nil, 500000},
		} {
			existing, err := seedRates(ctx, tx, zone)
			if err != nil {
				return err
			}
			found := false
			for _, rate := range existing {
				if rate.Name == band.name {
					found = true
					break
				}
			}
			if found {
				continue
			}
			rate := domain.Rate{ZoneID: zone, Name: band.name, PriceAmount: fixture.price + band.extra, Currency: "COP", MinWeightGrams: band.min, MaxWeightGrams: band.max, FreeShippingThresholdAmount: value(int64(15000000)), EstimatedDaysMin: 3, EstimatedDaysMax: 5, Status: "active"}
			if err := domain.ValidateRate(rate, existing); err != nil {
				return fmt.Errorf("validate demo shipping rate: %w", err)
			}
			if _, err := tx.ExecContext(ctx, `INSERT INTO shipping.shipping_rates(zone_id,name,price_amount,currency,min_weight_grams,max_weight_grams,free_shipping_threshold_amount,estimated_days_min,estimated_days_max,status) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`, zone, rate.Name, rate.PriceAmount, rate.Currency, rate.MinWeightGrams, rate.MaxWeightGrams, rate.FreeShippingThresholdAmount, rate.EstimatedDaysMin, rate.EstimatedDaysMax, rate.Status); err != nil {
				return fmt.Errorf("seed shipping rate: %w", err)
			}
		}
	}
	if err := tx.Commit(); err != nil {
		return fmt.Errorf("commit shipping seed: %w", err)
	}
	return nil
}
func value[T any](v T) *T { return &v }
func seedRates(ctx context.Context, tx *sql.Tx, zone string) (rates []domain.Rate, err error) {
	rows, err := tx.QueryContext(ctx, `SELECT id,zone_id,name,price_amount,currency,min_weight_grams,max_weight_grams,free_shipping_threshold_amount,estimated_days_min,estimated_days_max,status FROM shipping.shipping_rates WHERE zone_id=$1`, zone)
	if err != nil {
		return nil, fmt.Errorf("load stored demo rates: %w", err)
	}
	defer func() { err = errors.Join(err, rows.Close()) }()
	for rows.Next() {
		var rate domain.Rate
		if err := rows.Scan(&rate.ID, &rate.ZoneID, &rate.Name, &rate.PriceAmount, &rate.Currency, &rate.MinWeightGrams, &rate.MaxWeightGrams, &rate.FreeShippingThresholdAmount, &rate.EstimatedDaysMin, &rate.EstimatedDaysMax, &rate.Status); err != nil {
			return nil, fmt.Errorf("read stored demo rate: %w", err)
		}
		rates = append(rates, rate)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("read stored demo rates: %w", err)
	}
	return rates, nil
}
