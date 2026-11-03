package postgres

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/freedomCruz/monte-luna/backend/internal/orders/domain"
	"github.com/freedomCruz/monte-luna/backend/internal/platform"
	"github.com/jackc/pgx/v5"
)

// AdminTransition serializes with dispatch through the same order row lock.
func (r *Repository) AdminTransition(ctx context.Context, w domain.AdminWrite) (err error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin admin transition: %w", err)
	}
	defer rollback(ctx, tx, &err)
	var status, number string
	var version int32
	err = tx.QueryRow(ctx, `SELECT status,version,order_number FROM orders.orders WHERE id=$1 FOR UPDATE`, w.OrderID).Scan(&status, &version, &number)
	if errors.Is(err, pgx.ErrNoRows) {
		return &domain.Error{Status: 404, Code: "order_not_found"}
	}
	if err != nil {
		return err
	}
	if version != w.Version {
		return &domain.Error{Status: 412, Code: "version_conflict"}
	}
	target := domain.AdminTarget(w.Action, status)
	if target == "" {
		return &domain.Error{Status: 409, Code: "invalid_order_transition"}
	}
	var event string
	var payload map[string]any
	switch target {
	case "cancelled":
		// A dispatch commits while holding this lock, so its shipment state is
		// final here even before the shipment_shipped consumer converges.
		dispatched, err := w.Dispatch(ctx, w.OrderID)
		if err != nil {
			return err
		}
		if dispatched {
			return &domain.Error{Status: 409, Code: "invalid_order_transition"}
		}
		// Same pattern as expiry: the idempotent catalog release commits while
		// the order stays locked; a failed commit is repaired by a retry.
		if err := w.Release(ctx, w.OrderID); err != nil {
			return fmt.Errorf("release cancelled stock: %w", err)
		}
		_, err = tx.Exec(ctx, `UPDATE orders.orders SET status='cancelled',cancelled_at=$2,updated_at=$2,version=version+1 WHERE id=$1`, w.OrderID, w.At)
		if err != nil {
			return err
		}
		event = "orders.order_cancelled"
		payload = map[string]any{"order_id": w.OrderID, "order_number": number, "reason": "order_cancelled", "cancelled_at": w.At}
	default:
		if _, err := tx.Exec(ctx, `UPDATE orders.orders SET status=$2,updated_at=$3,version=version+1 WHERE id=$1`, w.OrderID, target, w.At); err != nil {
			return err
		}
		if target == "delivered" {
			event = "orders.order_delivered"
			payload = map[string]any{"order_id": w.OrderID, "delivered_at": w.At, "actor_id": w.ActorID}
		}
	}
	if err := insertAdminHistory(ctx, tx, w.OrderID, status, target, w.ActorID, w.Note, w.At); err != nil {
		return err
	}
	if event != "" {
		body, err := json.Marshal(payload)
		if err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `INSERT INTO orders.outbox(type,occurred_at,payload,available_at) VALUES($1,$2,$3,$2)`, event, w.At, body); err != nil {
			return err
		}
	}
	return tx.Commit(ctx)
}

func (r *Repository) ShipmentShipped(ctx context.Context, eventID, orderID, actorID string, at time.Time) error {
	return platform.ConsumeOnce(ctx, r.pool, "orders", eventID, func(tx pgx.Tx) error {
		var status string
		if err := tx.QueryRow(ctx, `SELECT status FROM orders.orders WHERE id=$1 FOR UPDATE`, orderID).Scan(&status); err != nil {
			return fmt.Errorf("lock shipped order: %w", err)
		}
		steps, ok := domain.ShippedPath(status)
		if !ok {
			return fmt.Errorf("shipment shipped for order in status %s", status)
		}
		if len(steps) == 0 {
			return nil
		}
		if _, err := tx.Exec(ctx, `UPDATE orders.orders SET status='shipped',updated_at=$2,version=version+1 WHERE id=$1`, orderID, at); err != nil {
			return err
		}
		for _, step := range steps {
			if err := insertAdminHistory(ctx, tx, orderID, step[0], step[1], actorID, nil, at); err != nil {
				return err
			}
		}
		return nil
	})
}

func insertAdminHistory(ctx context.Context, tx pgx.Tx, orderID, from, to, actorID string, note *string, at time.Time) error {
	_, err := tx.Exec(ctx, `INSERT INTO orders.order_status_history(order_id,from_status,to_status,actor_type,actor_id,note,created_at) VALUES($1,$2,$3,'admin',$4,$5,$6)`, orderID, from, to, actorID, note, at)
	return err
}
