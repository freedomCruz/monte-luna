package postgres_test

import (
	"bytes"
	"context"
	"errors"
	"testing"

	"github.com/freedomCruz/monte-luna/backend/internal/orders"
	"github.com/jackc/pgx/v5/pgconn"
)

func TestPublicDispatchGuard(t *testing.T) {
	db, url := database(t)
	if err := orders.Migrate(t.Context(), db); err != nil {
		t.Fatal(err)
	}
	id := scalar[string](t, db, orderFixture)
	m, err := orders.NewRuntime(t.Context(), url, nil, nil, nil, bytes.Repeat([]byte{1}, 32), nil, orders.RuntimeOptions{})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(m.Close)
	for _, tt := range []struct {
		status   string
		expected int32
		code     string
	}{
		{"pending_payment", 1, "invalid_order_transition"}, {"paid", 1, ""}, {"preparing", 1, ""},
		{"paid", 2, "version_conflict"}, {"shipped", 1, "invalid_order_transition"}, {"delivered", 1, "invalid_order_transition"},
		{"cancelled", 1, "invalid_order_transition"}, {"expired", 1, "invalid_order_transition"},
	} {
		t.Run(tt.status+tt.code, func(t *testing.T) {
			execSQL(t, db, `UPDATE orders.orders SET status=$2 WHERE id=$1`, id, tt.status)
			before := snapshot(t, db)
			called := false
			err := m.WithDispatchOrder(t.Context(), id, tt.expected, func(ctx context.Context) error {
				called = true
				// The public port must retain its row lock through the external callback.
				_, lockErr := db.ExecContext(ctx, `SELECT id FROM orders.orders WHERE id=$1 FOR UPDATE NOWAIT`, id)
				var conflict *pgconn.PgError
				if !errors.As(lockErr, &conflict) || conflict.Code != "55P03" {
					t.Fatalf("order not locked: %v", lockErr)
				}
				return nil
			})
			if tt.code == "" {
				if err != nil || !called {
					t.Fatalf("called=%v err=%v", called, err)
				}
			} else {
				var problem *orders.AdminOrderError
				if !errors.As(err, &problem) || problem.Code != tt.code || called {
					t.Fatalf("called=%v err=%v", called, err)
				}
			}
			if snapshot(t, db) != before {
				t.Fatal("guard changed order, version, history or outbox")
			}
			execSQL(t, db, `SELECT id FROM orders.orders WHERE id=$1 FOR UPDATE NOWAIT`, id)
		})
	}
	missing := "01946894-3d9a-7c98-b807-6c84c1762c35"
	before := snapshot(t, db)
	err = m.WithDispatchOrder(t.Context(), missing, 1, func(context.Context) error { t.Fatal("called for missing order"); return nil })
	var problem *orders.AdminOrderError
	if !errors.As(err, &problem) || problem.Code != "order_not_found" || snapshot(t, db) != before {
		t.Fatalf("missing: %v", err)
	}
	execSQL(t, db, `UPDATE orders.orders SET status='paid' WHERE id=$1`, id)
	sentinel := errors.New("shipping callback failed")
	err = m.WithDispatchOrder(t.Context(), id, 1, func(context.Context) error { return sentinel })
	if !errors.Is(err, sentinel) {
		t.Fatalf("callback failure lost: %v", err)
	}
	execSQL(t, db, `SELECT id FROM orders.orders WHERE id=$1 FOR UPDATE NOWAIT`, id)
}
