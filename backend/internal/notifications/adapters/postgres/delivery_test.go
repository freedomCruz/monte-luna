package postgres_test

import (
	"context"
	"encoding/json"
	"strings"
	"testing"
	"time"

	"github.com/freedomCruz/monte-luna/backend/internal/notifications/adapters"
	"github.com/freedomCruz/monte-luna/backend/internal/notifications/adapters/postgres"
	"github.com/freedomCruz/monte-luna/backend/internal/notifications/app"
	"github.com/freedomCruz/monte-luna/backend/internal/notifications/domain"
)

type localDecryptor struct{}

func (localDecryptor) Decrypt(context.Context, string, string) (string, error) { return "FAKE_TOKEN", nil }

type localLinks struct{}

func (localLinks) Build(context.Context, string, string) (string, error) {
	return "https://example.test/reset?token=FAKE_TOKEN", nil
}

func TestDeliveryBookkeepingAndNonregression(t *testing.T) {
	db, pool := database(t)
	if err := postgres.Migrate(t.Context(), db); err != nil {
		t.Fatal(err)
	}
	r := postgres.NewRepository(pool)
	now := time.Date(2026, 10, 20, 12, 0, 0, 0, time.UTC)
	message, err := r.Intake(t.Context(), request(), now)
	if err != nil {
		t.Fatal(err)
	}
	if err := r.RecordFailure(t.Context(), message.ID, now); err != nil {
		t.Fatal(err)
	}
	if scalar[string](t, db, `SELECT last_error FROM notifications.email_messages WHERE id=$1`, message.ID) != "notification delivery failed" {
		t.Fatal("unsafe failure detail")
	}
	if err := r.RecordSent(t.Context(), message.ID, domain.SendResult{Provider: "capture", MessageID: "capture_" + message.ID}, now); err != nil {
		t.Fatal(err)
	}
	replay, err := r.Intake(t.Context(), request(), now)
	if err != nil {
		t.Fatal(err)
	}
	if replay.Status != "sent" || replay.Provider != "capture" || replay.Attempts != 2 || replay.SentAt == nil || replay.LastError != nil {
		t.Fatalf("delivery metadata=%+v", replay)
	}
	var before string
	for _, status := range []string{"sent", "delivered", "bounced", "complained", "suppressed"} {
		exec(t, db, `UPDATE notifications.email_messages SET status=$2 WHERE id=$1`, message.ID, status)
		before = snapshot(t, db)
		if err := r.RecordFailure(t.Context(), message.ID, now.Add(time.Minute)); err != nil {
			t.Fatal(err)
		}
		if err := r.RecordSent(t.Context(), message.ID, domain.SendResult{Provider: "capture", MessageID: "other"}, now.Add(time.Minute)); err != nil {
			t.Fatal(err)
		}
		if snapshot(t, db) != before {
			t.Fatalf("bookkeeping regressed terminal %s", status)
		}
	}
	before = snapshot(t, db)
	if err := r.RecordSent(t.Context(), message.ID, domain.SendResult{}, now); err == nil {
		t.Fatal("invalid result accepted")
	}
	if snapshot(t, db) != before {
		t.Fatal("invalid result changed data")
	}
}

func TestConsumerPersistsNoSecretsInPostgres(t *testing.T) {
	db, pool := database(t)
	if err := postgres.Migrate(t.Context(), db); err != nil {
		t.Fatal(err)
	}
	r := postgres.NewRepository(pool)
	renderer, err := adapters.NewTemplateRenderer()
	if err != nil {
		t.Fatal(err)
	}
	capture := adapters.NewCaptureSender()
	now := func() time.Time { return time.Date(2026, 10, 20, 12, 0, 0, 0, time.UTC) }
	consumer := app.NewConsumer(r, renderer, capture, localDecryptor{}, localLinks{}, now)
	raw := map[string]string{"email": "Admin@example.com", "admin_user_id": request().TemplateData.AdminUserID, "display_name": "Admin", "raw_token_encrypted": "FAKE_CIPHERTEXT"}
	payload, err := json.Marshal(raw)
	if err != nil {
		t.Fatal(err)
	}
	event := domain.Event{ID: request().SourceEventID, Type: "identity.password_reset_requested", Payload: payload}
	if err := consumer.Handle(t.Context(), event); err != nil {
		t.Fatal(err)
	}
	// A restarted capture contains no secrets; a terminal database row prevents resending.
	secondCapture := adapters.NewCaptureSender()
	restarted := app.NewConsumer(r, renderer, secondCapture, localDecryptor{}, localLinks{}, now)
	before := snapshot(t, db)
	if err := restarted.Handle(t.Context(), event); err != nil {
		t.Fatal(err)
	}
	if snapshot(t, db) != before || len(secondCapture.Messages()) != 0 || len(capture.Messages()) != 1 {
		t.Fatal("completed event resent after restart")
	}
	for _, secret := range []string{"FAKE_CIPHERTEXT", "FAKE_TOKEN", "https://", "raw_token_encrypted", "<p>"} {
		if strings.Contains(snapshot(t, db), secret) {
			t.Fatalf("durable secret: %s", secret)
		}
	}
}
