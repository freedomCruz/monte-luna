package postgres_test

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/freedomCruz/monte-luna/backend/internal/notifications/adapters"
	"github.com/freedomCruz/monte-luna/backend/internal/notifications/adapters/postgres"
	"github.com/freedomCruz/monte-luna/backend/internal/notifications/app"
	"github.com/freedomCruz/monte-luna/backend/internal/notifications/domain"
)

const (
	noticeOrderID   = "019a0000-0000-7000-8000-0000000000a1"
	shippedEventID  = "019a0000-0000-7000-8000-0000000000b1"
	cancelEventID   = "019a0000-0000-7000-8000-0000000000b2"
	suppressEventID = "019a0000-0000-7000-8000-0000000000b3"
	failEventID     = "019a0000-0000-7000-8000-0000000000b4"
)

type orderContacts map[string]domain.OrderContact

func (o orderContacts) OrderContact(_ context.Context, id string) (domain.OrderContact, error) {
	contact, ok := o[id]
	if !ok {
		return domain.OrderContact{}, errors.New("order not found")
	}
	return contact, nil
}

type downSender struct{ calls int }

func (s *downSender) Send(context.Context, domain.Email) (domain.SendResult, error) {
	s.calls++
	return domain.SendResult{}, errors.New("provider outage")
}

func TestOrderConsumerSendsShipmentAndCancellationEmails(t *testing.T) {
	db, pool := database(t)
	if err := postgres.Migrate(t.Context(), db); err != nil {
		t.Fatal(err)
	}
	r := postgres.NewRepository(pool)
	renderer, err := adapters.NewTemplateRenderer()
	if err != nil {
		t.Fatal(err)
	}
	now := func() time.Time { return time.Date(2026, 11, 3, 18, 0, 0, 0, time.UTC) }
	reason := "Sin existencias del lote"
	contacts := orderContacts{noticeOrderID: {OrderNumber: "ML-000123", Email: "ana@example.com", Name: "Ana", CancelReason: &reason}}
	capture := adapters.NewCaptureSender()
	consumer := app.NewOrderConsumer(r, renderer, capture, contacts, now)

	shipped := domain.Event{ID: shippedEventID, Type: "shipping.shipment_shipped", Payload: []byte(`{"shipment_id":"019a0000-0000-7000-8000-0000000000c1","order_id":"` + noticeOrderID + `","carrier_name":"Coordinadora","tracking_number":null,"tracking_url":null,"shipped_at":"2026-11-03T17:00:00Z","actor_id":"019a0000-0000-7000-8000-0000000000d1"}`)}
	if err := consumer.Handle(t.Context(), shipped); err != nil {
		t.Fatal(err)
	}
	// Replaying the same event sends nothing and changes no row.
	before := snapshot(t, db)
	if err := consumer.Handle(t.Context(), shipped); err != nil {
		t.Fatal(err)
	}
	if snapshot(t, db) != before {
		t.Fatal("replayed shipment event changed notification rows")
	}
	cancelled := domain.Event{ID: cancelEventID, Type: "orders.order_cancelled", Payload: []byte(`{"order_id":"` + noticeOrderID + `","order_number":"ML-000123","reason":"order_cancelled","cancelled_at":"2026-11-03T17:30:00Z"}`)}
	if err := consumer.Handle(t.Context(), cancelled); err != nil {
		t.Fatal(err)
	}
	sent := capture.Messages()
	if len(sent) != 2 {
		t.Fatalf("sent %d emails, want 2", len(sent))
	}
	if sent[0].Recipient != "ana@example.com" || sent[0].Subject != "Tu pedido ML-000123 de Monteluna va en camino" || !strings.Contains(sent[0].Text, "Transportadora: Coordinadora") || strings.Contains(sent[0].Text, "Número de guía") {
		t.Fatalf("shipment email=%+v", sent[0])
	}
	if sent[1].Subject != "Tu pedido ML-000123 de Monteluna fue cancelado" || !strings.Contains(sent[1].Text, "Motivo: Sin existencias del lote") {
		t.Fatalf("cancellation email=%+v", sent[1])
	}
	if scalar[int](t, db, `SELECT count(*) FROM notifications.email_messages WHERE status='sent' AND template_key IN ('order_shipped','order_cancelled')`) != 2 {
		t.Fatal("sent messages not recorded")
	}
	if strings.Contains(snapshot(t, db), "Coordinadora") || strings.Contains(snapshot(t, db), reason) {
		t.Fatal("rendered email content persisted")
	}

	// A suppressed recipient is recorded as suppressed and never reaches the sender.
	if err := r.Suppress(t.Context(), "ana@example.com", "manual", nil, now()); err != nil {
		t.Fatal(err)
	}
	suppressed := cancelled
	suppressed.ID = suppressEventID
	if err := consumer.Handle(t.Context(), suppressed); err != nil {
		t.Fatal(err)
	}
	if len(capture.Messages()) != 2 || scalar[string](t, db, `SELECT status FROM notifications.email_messages WHERE source_event_id=$1`, suppressEventID) != "suppressed" {
		t.Fatal("suppressed recipient was emailed")
	}

	// A provider outage records a retryable failure; the relay retries the event.
	contacts[noticeOrderID] = domain.OrderContact{OrderNumber: "ML-000123", Email: "otro@example.com", Name: "Otro"}
	down := &downSender{}
	failing := app.NewOrderConsumer(r, renderer, down, contacts, now)
	failed := shipped
	failed.ID = failEventID
	if err := failing.Handle(t.Context(), failed); !errors.Is(err, app.ErrDelivery) {
		t.Fatalf("outage err=%v, want ErrDelivery", err)
	}
	if down.calls != 1 || scalar[string](t, db, `SELECT status FROM notifications.email_messages WHERE source_event_id=$1`, failEventID) != "failed" {
		t.Fatal("outage not recorded as failed")
	}
	if err := consumer.Handle(t.Context(), failed); err != nil {
		t.Fatal(err)
	}
	if scalar[string](t, db, `SELECT status FROM notifications.email_messages WHERE source_event_id=$1`, failEventID) != "sent" {
		t.Fatal("retry after outage did not send")
	}

	// Invalid events and unknown orders store nothing.
	before = snapshot(t, db)
	for _, bad := range []domain.Event{
		{ID: "019a0000-0000-7000-8000-0000000000e1", Type: "shipping.shipment_shipped", Payload: []byte(`{"order_id":"` + noticeOrderID + `","carrier_name":"  "}`)},
		{ID: "019a0000-0000-7000-8000-0000000000e2", Type: "orders.order_cancelled", Payload: []byte(`{"order_id":"not-a-uuid"}`)},
		{ID: "019a0000-0000-7000-8000-0000000000e3", Type: "orders.order_cancelled", Payload: []byte(`{"order_id":"019a0000-0000-7000-8000-0000000000ff"}`)},
		{ID: "019a0000-0000-7000-8000-0000000000e4", Type: "orders.order_paid", Payload: []byte(`{"order_id":"` + noticeOrderID + `"}`)},
	} {
		if err := consumer.Handle(t.Context(), bad); err == nil {
			t.Fatalf("accepted invalid event %s", bad.ID)
		}
	}
	if snapshot(t, db) != before {
		t.Fatal("rejected events changed notification rows")
	}
}
