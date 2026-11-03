package postgres

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/freedomCruz/monte-luna/backend/internal/platform"
	shippingsql "github.com/freedomCruz/monte-luna/backend/internal/shipping/adapters/postgres/sqlc"
	"github.com/freedomCruz/monte-luna/backend/internal/shipping/domain"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
)

func shipment(row shippingsql.FindShipmentRow) domain.Shipment {
	s := domain.Shipment{ID: row.ID, OrderID: row.OrderID, Status: row.Status, CarrierName: row.CarrierName, TrackingNumber: row.TrackingNumber, TrackingURL: row.TrackingUrl, ActorID: row.ActorID, Version: row.Version}
	if row.ShippedAt.Valid {
		value := row.ShippedAt.Time.UTC()
		s.ShippedAt = &value
	}
	if row.DeliveredAt.Valid {
		value := row.DeliveredAt.Time.UTC()
		s.DeliveredAt = &value
	}
	return s
}
func (r *Repository) Shipment(ctx context.Context, orderID string) (*domain.Shipment, error) {
	row, err := shippingsql.New(r.pool).FindShipment(ctx, orderID)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("find shipment: %w", err)
	}
	s := shipment(row)
	return &s, nil
}

// A module-local advisory lock also serializes initialization when no row exists.
// Lock ordering is always orders guard -> shipping advisory -> shipment row.
func lockShipmentOrder(ctx context.Context, tx pgx.Tx, orderID string) error {
	_, err := tx.Exec(ctx, `SELECT pg_advisory_xact_lock(hashtextextended($1,0))`, "shipping.shipment:"+orderID)
	return err
}
func (r *Repository) Dispatch(ctx context.Context, in domain.DispatchInput, now time.Time) (domain.Shipment, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return domain.Shipment{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	if err := lockShipmentOrder(ctx, tx, in.OrderID); err != nil {
		return domain.Shipment{}, err
	}
	q := shippingsql.New(tx)
	row, err := q.LockShipment(ctx, in.OrderID)
	if errors.Is(err, pgx.ErrNoRows) {
		if in.ShipmentVersion != nil {
			return domain.Shipment{}, domain.ErrVersionConflict
		}
		if err := q.EnsurePendingShipment(ctx, in.OrderID); err != nil {
			return domain.Shipment{}, err
		}
		row, err = q.LockShipment(ctx, in.OrderID)
	} else if err == nil && (in.ShipmentVersion == nil || *in.ShipmentVersion != row.Version) {
		return domain.Shipment{}, domain.ErrVersionConflict
	}
	if err != nil {
		return domain.Shipment{}, err
	}
	if row.Status != "pending" {
		return domain.Shipment{}, domain.ErrInvalidTransition
	}
	stamp := pgtype.Timestamptz{Time: now, Valid: true}
	count, err := q.DispatchShipment(ctx, shippingsql.DispatchShipmentParams{OrderID: in.OrderID, CarrierName: &in.CarrierName, TrackingNumber: in.TrackingNumber, TrackingUrl: in.TrackingURL, ShippedAt: stamp, ActorID: &in.ActorID, Version: row.Version})
	if err != nil {
		return domain.Shipment{}, err
	}
	if count != 1 {
		return domain.Shipment{}, domain.ErrVersionConflict
	}
	updated, err := q.FindShipment(ctx, in.OrderID)
	if err != nil {
		return domain.Shipment{}, err
	}
	s := shipment(updated)
	payload, err := json.Marshal(struct {
		ShipmentID     string    `json:"shipment_id"`
		OrderID        string    `json:"order_id"`
		CarrierName    string    `json:"carrier_name"`
		TrackingNumber *string   `json:"tracking_number"`
		TrackingURL    *string   `json:"tracking_url"`
		ShippedAt      time.Time `json:"shipped_at"`
		ActorID        string    `json:"actor_id"`
	}{s.ID, in.OrderID, in.CarrierName, in.TrackingNumber, in.TrackingURL, now, in.ActorID})
	if err != nil {
		return domain.Shipment{}, err
	}
	if err := q.InsertShipmentEvent(ctx, shippingsql.InsertShipmentEventParams{OccurredAt: stamp, Payload: payload}); err != nil {
		return domain.Shipment{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return domain.Shipment{}, err
	}
	return s, nil
}
func (r *Repository) OrderPaid(ctx context.Context, eventID, orderID string) error {
	return platform.ConsumeOnce(ctx, r.pool, "shipping", eventID, func(tx pgx.Tx) error {
		if err := lockShipmentOrder(ctx, tx, orderID); err != nil {
			return err
		}
		return shippingsql.New(tx).EnsurePendingShipment(ctx, orderID)
	})
}
func (r *Repository) OrderDelivered(ctx context.Context, eventID, orderID string, at time.Time) error {
	return platform.ConsumeOnce(ctx, r.pool, "shipping", eventID, func(tx pgx.Tx) error {
		if err := lockShipmentOrder(ctx, tx, orderID); err != nil {
			return err
		}
		q := shippingsql.New(tx)
		s, err := q.LockShipment(ctx, orderID)
		if err != nil {
			return err
		}
		if s.Status == "delivered" || s.Status == "returned" {
			return nil
		}
		if s.Status != "shipped" {
			return domain.ErrInvalidTransition
		}
		if s.ShippedAt.Valid && at.Before(s.ShippedAt.Time) {
			return errors.New("delivery predates shipment")
		}
		_, err = q.DeliverShipment(ctx, shippingsql.DeliverShipmentParams{OrderID: orderID, DeliveredAt: pgtype.Timestamptz{Time: at, Valid: true}})
		return err
	})
}
