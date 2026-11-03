package shipping_test

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"testing"
	"time"

	"github.com/freedomCruz/monte-luna/backend/internal/platform"
	"github.com/freedomCruz/monte-luna/backend/internal/shipping"
	_ "github.com/jackc/pgx/v5/stdlib"
	"github.com/testcontainers/testcontainers-go"
	pgcontainer "github.com/testcontainers/testcontainers-go/modules/postgres"
)

const fulfillmentOrderID = "01946894-3d9a-7c98-b807-6c84c1762c2f"
const fulfillmentActorID = "01946894-3d9a-7c98-b807-6c84c1762c30"

func fulfillmentDB(t *testing.T) (*sql.DB, string) {
	t.Helper()
	ctx, cancel := context.WithTimeout(t.Context(), 2*time.Minute)
	defer cancel()
	c, err := pgcontainer.Run(ctx, "postgres:18.6-bookworm@sha256:afc7e2d441324c0388fa80c3d24f733b4194a4eb7f47dd8ee2b08eb1a24a647c", pgcontainer.WithDatabase("shipping_fulfillment"), pgcontainer.WithUsername("test"), pgcontainer.WithPassword("test"), pgcontainer.BasicWaitStrategies())
	if err != nil {
		t.Fatal(err)
	}
	testcontainers.CleanupContainer(t, c)
	url, err := c.ConnectionString(ctx, "sslmode=disable")
	if err != nil {
		t.Fatal(err)
	}
	db, err := sql.Open("pgx", url)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = db.Close() })
	if err := shipping.Migrate(ctx, db); err != nil {
		t.Fatal(err)
	}
	return db, url
}
func shipScalar[T any](t *testing.T, db *sql.DB, query string, args ...any) T {
	t.Helper()
	var v T
	if err := db.QueryRowContext(t.Context(), query, args...).Scan(&v); err != nil {
		t.Fatal(err)
	}
	return v
}
func shipSnapshot(t *testing.T, db *sql.DB) string {
	t.Helper()
	var s string
	for _, table := range []string{"shipments", "outbox", "processed_events"} {
		s += shipScalar[string](t, db, fmt.Sprintf(`SELECT COALESCE(jsonb_agg(to_jsonb(r) ORDER BY id),'[]')::text FROM shipping.%s r`, table))
	}
	return s
}

type allowDispatch struct{}

func (allowDispatch) WithDispatchOrder(ctx context.Context, _ string, _ int32, fn func(context.Context) error) error {
	return fn(ctx)
}
func shipmentModule(t *testing.T, url string) *shipping.Module {
	t.Helper()
	m, err := shipping.New(t.Context(), url)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(m.Close)
	if err := m.EnableFulfillment(allowDispatch{}, func() time.Time { return time.Date(2026, 11, 3, 15, 0, 0, 0, time.UTC) }); err != nil {
		t.Fatal(err)
	}
	return m
}
func shipEvent(id, kind string, body any) platform.Event {
	b, _ := json.Marshal(body)
	return platform.Event{ID: id, Type: kind, Payload: b}
}
func TestShipmentConsumersAndDispatch(t *testing.T) {
	db, url := fulfillmentDB(t)
	m := shipmentModule(t, url)
	paid := shipEvent("01946894-3d9a-7c98-b807-6c84c1762c31", "orders.order_paid", map[string]any{"order_id": fulfillmentOrderID})
	if err := m.HandleOrderPaid(t.Context(), paid); err != nil {
		t.Fatal(err)
	}
	s, err := m.Shipment(t.Context(), fulfillmentOrderID)
	if err != nil || s == nil || s.Status != "pending" || s.CarrierName != nil || s.Version != 1 {
		t.Fatalf("shipment=%+v error=%v", s, err)
	}
	before := shipSnapshot(t, db)
	if err := m.HandleOrderPaid(t.Context(), paid); err != nil {
		t.Fatal(err)
	}
	if shipSnapshot(t, db) != before {
		t.Fatal("duplicate paid event changed data")
	}
	version := int32(1)
	got, err := m.Dispatch(t.Context(), shipping.DispatchInput{OrderID: fulfillmentOrderID, ActorID: fulfillmentActorID, OrderVersion: 1, ShipmentVersion: &version, CarrierName: " Carrier "})
	if err != nil || got.Status != "shipped" || got.Version != 2 || got.ShippedAt == nil || got.ActorID == nil || *got.ActorID != fulfillmentActorID || got.CarrierName == nil || *got.CarrierName != "Carrier" {
		t.Fatalf("dispatch=%+v error=%v", got, err)
	}
	if shipScalar[int](t, db, `SELECT count(*) FROM shipping.shipments`) != 1 || shipScalar[int](t, db, `SELECT count(*) FROM shipping.outbox WHERE type='shipping.shipment_shipped'`) != 1 {
		t.Fatal("dispatch rows/outbox")
	}
	var payload map[string]any
	if err := json.Unmarshal([]byte(shipScalar[string](t, db, `SELECT payload::text FROM shipping.outbox`)), &payload); err != nil {
		t.Fatal(err)
	}
	if payload["actor_id"] != fulfillmentActorID || payload["order_id"] != fulfillmentOrderID || payload["shipment_id"] != got.ID || payload["carrier_name"] != "Carrier" || payload["tracking_number"] != nil || payload["tracking_url"] != nil || payload["shipped_at"] != "2026-11-03T15:00:00Z" {
		t.Fatalf("payload=%v", payload)
	}
	before = shipSnapshot(t, db)
	if _, err := m.Dispatch(t.Context(), shipping.DispatchInput{OrderID: fulfillmentOrderID, ActorID: fulfillmentActorID, OrderVersion: 1, ShipmentVersion: &version, CarrierName: "Carrier"}); err == nil {
		t.Fatal("stale shipment accepted")
	}
	if shipSnapshot(t, db) != before {
		t.Fatal("rejected dispatch changed data")
	}
	delivered := shipEvent("01946894-3d9a-7c98-b807-6c84c1762c32", "orders.order_delivered", map[string]any{"order_id": fulfillmentOrderID, "actor_id": fulfillmentActorID, "delivered_at": "2026-11-04T15:00:00Z"})
	if err := m.HandleOrderDelivered(t.Context(), delivered); err != nil {
		t.Fatal(err)
	}
	s, err = m.Shipment(t.Context(), fulfillmentOrderID)
	if err != nil || s == nil || s.Status != "delivered" || s.Version != 3 || s.DeliveredAt == nil || s.DeliveredAt.Format(time.RFC3339) != "2026-11-04T15:00:00Z" {
		t.Fatalf("delivered=%+v error=%v", s, err)
	}
	before = shipSnapshot(t, db)
	if err := m.HandleOrderDelivered(t.Context(), delivered); err != nil {
		t.Fatal(err)
	}
	paid.ID = "01946894-3d9a-7c98-b807-6c84c1762c33"
	if err := m.HandleOrderPaid(t.Context(), paid); err != nil {
		t.Fatal(err)
	}
	// A distinct late paid event records only its guard; it never resets fulfillment.
	if shipScalar[int](t, db, `SELECT version FROM shipping.shipments`) != 3 || shipScalar[string](t, db, `SELECT status FROM shipping.shipments`) != "delivered" {
		t.Fatal("late paid regressed shipment")
	}
	if shipScalar[int](t, db, `SELECT count(*) FROM shipping.outbox`) != 1 {
		t.Fatal("consumer emitted extra dispatch")
	}
	_ = before
}
func TestOnDemandAndConsumerRollback(t *testing.T) {
	db, url := fulfillmentDB(t)
	m := shipmentModule(t, url)
	delivered := shipEvent("01946894-3d9a-7c98-b807-6c84c1762c32", "orders.order_delivered", map[string]any{"order_id": fulfillmentOrderID, "actor_id": fulfillmentActorID, "delivered_at": "2026-11-04T15:00:00Z"})
	before := shipSnapshot(t, db)
	if err := m.HandleOrderDelivered(t.Context(), delivered); err == nil {
		t.Fatal("delivery before shipment should retry")
	}
	if shipSnapshot(t, db) != before {
		t.Fatal("failed consumer committed guard")
	}
	in := shipping.DispatchInput{OrderID: fulfillmentOrderID, ActorID: fulfillmentActorID, OrderVersion: 1, CarrierName: "Carrier"}
	got, err := m.Dispatch(t.Context(), in)
	if err != nil || got.Version != 2 {
		t.Fatalf("on-demand=%+v/%v", got, err)
	}
	if err := m.HandleOrderDelivered(t.Context(), delivered); err != nil {
		t.Fatal(err)
	}
	before = shipSnapshot(t, db)
	// Force an outbox failure after an on-demand insert/update; all work must roll back.
	if _, err := db.ExecContext(t.Context(), `ALTER TABLE shipping.outbox ADD CONSTRAINT reject_dispatch CHECK(type<>'shipping.shipment_shipped') NOT VALID`); err != nil {
		t.Fatal(err)
	}
	in.OrderID = "01946894-3d9a-7c98-b807-6c84c1762c34"
	if _, err := m.Dispatch(t.Context(), in); err == nil {
		t.Fatal("expected outbox failure")
	}
	if shipSnapshot(t, db) != before {
		t.Fatal("failed outbox left shipment/version")
	}
}
