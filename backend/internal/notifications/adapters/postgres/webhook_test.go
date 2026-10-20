package postgres_test

import (
	"database/sql"
	"errors"
	"sync"
	"testing"
	"time"

	"github.com/freedomCruz/monte-luna/backend/internal/notifications/adapters/postgres"
	"github.com/freedomCruz/monte-luna/backend/internal/notifications/domain"
)

const webhookProviderID = "56761188-7520-42d8-8898-ff6fc54ce618"

func storedWebhookMessage(t *testing.T, db *sql.DB, r *postgres.Repository, now time.Time) string {
	t.Helper()
	if err := postgres.Migrate(t.Context(), db); err != nil {
		t.Fatal(err)
	}
	message, err := r.Intake(t.Context(), request(), now)
	if err != nil {
		t.Fatal(err)
	}
	if err := r.RecordSent(t.Context(), message.ID, domain.SendResult{Provider: "resend", MessageID: webhookProviderID}, now); err != nil {
		t.Fatal(err)
	}
	return message.ID
}
func providerEvent(kind, id string) domain.ProviderEvent {
	return domain.ProviderEvent{ExternalID: id, Type: kind, ProviderMessageID: webhookProviderID, Recipients: []string{"ADMIN@example.com"}, BounceType: "Permanent"}
}

func TestWebhookAtomicDeliverySuppressionAndLateEvents(t *testing.T) {
	db, pool := database(t)
	r := postgres.NewRepository(pool)
	now := time.Date(2026, 10, 20, 12, 0, 0, 0, time.UTC)
	id := storedWebhookMessage(t, db, r, now)
	if err := r.ProcessWebhook(t.Context(), providerEvent("email.delivered", "evt_delivery"), now); err != nil {
		t.Fatal(err)
	}
	if scalar[string](t, db, `SELECT status FROM notifications.email_messages WHERE id=$1`, id) != "delivered" {
		t.Fatal("delivery not applied")
	}
	before := snapshot(t, db)
	if err := r.ProcessWebhook(t.Context(), providerEvent("email.complained", "evt_delivery"), now.Add(time.Second)); err != nil {
		t.Fatal(err)
	}
	if snapshot(t, db) != before {
		t.Fatal("duplicate event caused effects")
	}
	if err := r.ProcessWebhook(t.Context(), providerEvent("email.complained", "evt_complaint"), now.Add(time.Second)); err != nil {
		t.Fatal(err)
	}
	if scalar[string](t, db, `SELECT reason FROM notifications.email_suppressions WHERE email='admin@example.com'`) != "complaint" || scalar[string](t, db, `SELECT source_message_id FROM notifications.email_suppressions WHERE email='admin@example.com'`) != id {
		t.Fatal("complaint suppression missing")
	}
	late := providerEvent("email.bounced", "evt_late_bounce")
	late.Recipients = []string{"SECOND@example.com", "ADMIN@example.com", "second@example.com"}
	if err := r.ProcessWebhook(t.Context(), late, now.Add(2*time.Second)); err != nil {
		t.Fatal(err)
	}
	if err := r.ProcessWebhook(t.Context(), providerEvent("email.delivered", "evt_late_delivery"), now.Add(3*time.Second)); err != nil {
		t.Fatal(err)
	}
	if scalar[string](t, db, `SELECT status FROM notifications.email_messages WHERE id=$1`, id) != "complained" || scalar[int](t, db, `SELECT attempts FROM notifications.email_messages WHERE id=$1`, id) != 1 {
		t.Fatal("late event regressed delivery or dispatch counter")
	}
	if scalar[int](t, db, `SELECT count(*) FROM notifications.email_suppressions`) != 2 || scalar[string](t, db, `SELECT reason FROM notifications.email_suppressions WHERE email='second@example.com'`) != "hard_bounce" {
		t.Fatal("late hard bounce suppression lost")
	}
	for _, bounce := range []string{"Temporary", "Unknown"} {
		event := providerEvent("email.bounced", "evt_"+bounce)
		event.BounceType = bounce
		event.Recipients = []string{"temporary@example.com"}
		if err := r.ProcessWebhook(t.Context(), event, now); err != nil {
			t.Fatal(err)
		}
	}
	if scalar[int](t, db, `SELECT count(*) FROM notifications.email_suppressions`) != 2 {
		t.Fatal("temporary/unknown bounce suppressed recipient")
	}
}

func TestWebhookUnmatchedFailureRollbackAndRetry(t *testing.T) {
	db, pool := database(t)
	r := postgres.NewRepository(pool)
	now := time.Date(2026, 10, 20, 12, 0, 0, 0, time.UTC)
	if err := postgres.Migrate(t.Context(), db); err != nil {
		t.Fatal(err)
	}
	event := providerEvent("email.bounced", "evt_retry")
	before := snapshot(t, db)
	if err := r.ProcessWebhook(t.Context(), event, now); !errors.Is(err, domain.ErrMessageNotFound) {
		t.Fatalf("unmatched=%v", err)
	}
	if snapshot(t, db) != before {
		t.Fatal("unmatched event committed ledger")
	}
	storedWebhookMessage(t, db, r, now)
	exec(t, db, `ALTER TABLE notifications.email_suppressions ADD CONSTRAINT test_reject_bounce CHECK(reason <> 'hard_bounce')`)
	before = snapshot(t, db)
	if err := r.ProcessWebhook(t.Context(), event, now); err == nil {
		t.Fatal("expected suppression constraint failure")
	}
	if snapshot(t, db) != before {
		t.Fatal("failed suppression committed ledger/status")
	}
	exec(t, db, `ALTER TABLE notifications.email_suppressions DROP CONSTRAINT test_reject_bounce`)
	if err := r.ProcessWebhook(t.Context(), event, now); err != nil {
		t.Fatal(err)
	}
	if scalar[string](t, db, `SELECT status FROM notifications.email_messages`) != "bounced" || scalar[int](t, db, `SELECT count(*) FROM notifications.provider_webhook_events`) != 1 {
		t.Fatal("failed event not retried")
	}
	for _, bad := range []domain.ProviderEvent{{}, {ExternalID: "invalid", Type: "email.bounced", ProviderMessageID: webhookProviderID, Recipients: []string{"not-email"}, BounceType: "Permanent"}} {
		before = snapshot(t, db)
		if err := r.ProcessWebhook(t.Context(), bad, now); err == nil {
			t.Fatal("invalid event accepted")
		}
		if snapshot(t, db) != before {
			t.Fatal("invalid event mutated state")
		}
	}
}

func TestConcurrentWebhookDedupAndPriority(t *testing.T) {
	db, pool := database(t)
	r := postgres.NewRepository(pool)
	now := time.Date(2026, 10, 20, 12, 0, 0, 0, time.UTC)
	storedWebhookMessage(t, db, r, now)
	run := func(events []domain.ProviderEvent) {
		start := make(chan struct{})
		errs := make(chan error, len(events))
		var wg sync.WaitGroup
		for _, event := range events {
			wg.Go(func() { <-start; errs <- r.ProcessWebhook(t.Context(), event, now) })
		}
		close(start)
		wg.Wait()
		close(errs)
		for err := range errs {
			if err != nil {
				t.Fatal(err)
			}
		}
	}
	events := make([]domain.ProviderEvent, 8)
	for i := range events {
		events[i] = providerEvent("email.bounced", "evt_concurrent")
	}
	run(events)
	if scalar[int](t, db, `SELECT count(*) FROM notifications.provider_webhook_events`) != 1 || scalar[int](t, db, `SELECT count(*) FROM notifications.email_suppressions`) != 1 {
		t.Fatal("concurrent duplicate effects")
	}
	run([]domain.ProviderEvent{providerEvent("email.delivered", "evt_d"), providerEvent("email.complained", "evt_c"), providerEvent("email.bounced", "evt_b")})
	if scalar[string](t, db, `SELECT status FROM notifications.email_messages`) != "complained" || scalar[int](t, db, `SELECT count(*) FROM notifications.provider_webhook_events`) != 4 {
		t.Fatal("concurrent terminal priority lost")
	}
}

func TestWebhookCleanupKeepsSuppressionsAndBoundary(t *testing.T) {
	db, pool := database(t)
	r := postgres.NewRepository(pool)
	now := time.Date(2026, 10, 20, 12, 0, 0, 0, time.UTC)
	id := storedWebhookMessage(t, db, r, now.AddDate(0, 0, -40))
	if err := r.ProcessWebhook(t.Context(), providerEvent("email.bounced", "evt_old"), now.AddDate(0, 0, -30).Add(-time.Microsecond)); err != nil {
		t.Fatal(err)
	}
	if err := r.ProcessWebhook(t.Context(), providerEvent("email.delivered", "evt_boundary"), now.AddDate(0, 0, -30)); err != nil {
		t.Fatal(err)
	}
	if err := r.Cleanup(t.Context(), now, 1); err != nil {
		t.Fatal(err)
	}
	if scalar[int](t, db, `SELECT count(*) FROM notifications.provider_webhook_events`) != 1 || scalar[string](t, db, `SELECT external_event_id FROM notifications.provider_webhook_events`) != "evt_boundary" {
		t.Fatal("cleanup removed 30-day boundary or retained older event")
	}
	if err := r.Cleanup(t.Context(), now.AddDate(3, 0, 0), 100); err != nil {
		t.Fatal(err)
	}
	if scalar[int](t, db, `SELECT count(*) FROM notifications.email_suppressions`) != 1 || !scalar[bool](t, db, `SELECT recipient_email IS NULL AND template_data='{}'::jsonb AND status='bounced' FROM notifications.email_messages WHERE id=$1`, id) {
		t.Fatal("cleanup lost indefinite suppression or failed anonymization")
	}
}
