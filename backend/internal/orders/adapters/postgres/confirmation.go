package postgres

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	"github.com/freedomCruz/monte-luna/backend/internal/orders/domain"
	"github.com/freedomCruz/monte-luna/backend/internal/platform"
	"github.com/jackc/pgx/v5"
)

func (r *Repository) ConfirmPayment(ctx context.Context, eventID, orderID string, now time.Time, inventory domain.ReallocationPort) error {
	return platform.ConsumeOnce(ctx, r.pool, "orders", eventID, func(tx pgx.Tx) error {
		var status, number, email, currency string
		var amount int64
		err := tx.QueryRow(ctx, `SELECT status,order_number,customer_email,currency,total_amount FROM orders.orders WHERE id=$1 FOR UPDATE`, orderID).Scan(&status, &number, &email, &currency, &amount)
		if err != nil {
			return err
		}
		if domain.PaymentTransition(status, true) == "" {
			return nil
		}
		stock := true
		note := "Payment confirmed."
		if status == "expired" {
			rows, err := tx.Query(ctx, "SELECT variant_id::text,quantity FROM orders.order_lines WHERE order_id=$1 ORDER BY variant_id", orderID)
			if err != nil {
				return err
			}
			var items []domain.Item
			for rows.Next() {
				var item domain.Item
				if err := rows.Scan(&item.VariantID, &item.Quantity); err != nil {
					rows.Close()
					return err
				}
				items = append(items, item)
			}
			rows.Close()
			if err := rows.Err(); err != nil {
				return err
			}
			_, err = inventory.Reallocate(ctx, orderID, items)
			if err != nil {
				var shortage *domain.Error
				if !errors.As(err, &shortage) || shortage.Code != "insufficient_stock" {
					return err
				}
				stock = false
				note = "Late payment could not reallocate stock; manual refund required."
			} else {
				note = "Late payment approved; stock reallocated after expiry."
			}
		}
		target := domain.PaymentTransition(status, stock)
		if target == "paid" {
			_, err = tx.Exec(ctx, `UPDATE orders.orders SET status='paid',paid_at=$2,updated_at=$2,version=version+1 WHERE id=$1`, orderID, now)
		} else {
			_, err = tx.Exec(ctx, `UPDATE orders.orders SET status='cancelled',cancelled_at=$2,updated_at=$2,version=version+1 WHERE id=$1`, orderID, now)
		}
		if err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `INSERT INTO orders.order_status_history(order_id,from_status,to_status,actor_type,note,created_at) VALUES($1,$2,$3,'system',$4,$5)`, orderID, status, target, note, now); err != nil {
			return err
		}
		eventType := "orders.order_paid"
		payload := map[string]any{"order_id": orderID, "order_number": number, "customer_email": email, "total_amount": amount, "currency": currency, "paid_at": now}
		if target == "cancelled" {
			eventType = "orders.order_cancelled"
			payload = map[string]any{"order_id": orderID, "order_number": number, "reason": "late_payment_no_stock", "cancelled_at": now}
		}
		body, err := json.Marshal(payload)
		if err != nil {
			return err
		}
		_, err = tx.Exec(ctx, `INSERT INTO orders.outbox(type,occurred_at,payload,available_at) VALUES($1,$2,$3,$2)`, eventType, now, body)
		return err
	})
}
func (r *Repository) OrderNumber(ctx context.Context, id string) (string, error) {
	var number string
	err := r.pool.QueryRow(ctx, "SELECT order_number FROM orders.orders WHERE id=$1", id).Scan(&number)
	return number, err
}
