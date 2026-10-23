package postgres_test

import (
	"encoding/json"
	"reflect"
	"sync"
	"testing"
	"time"

	"github.com/freedomCruz/monte-luna/backend/internal/notifications/adapters/postgres"
	"github.com/freedomCruz/monte-luna/backend/internal/notifications/domain"
)

func request() domain.Intake {
	return domain.Intake{SourceEventID: "019a0000-0000-7000-8000-000000000001", EventType: "identity.password_reset_requested", TemplateKey: "password_reset", RecipientEmail: "Admin@Example.COM", TemplateData: domain.TemplateData{AdminUserID: "019a0000-0000-7000-8000-000000000002", DisplayName: "Admin"}}
}

func TestIntakeIdempotencySuppressionAndRollback(t *testing.T) {
	db, pool := database(t)
	if err := postgres.Migrate(t.Context(), db); err != nil {
		t.Fatal(err)
	}
	r := postgres.NewRepository(pool)
	now := time.Date(2026, 10, 20, 12, 0, 0, 0, time.UTC)
	first, err := r.Intake(t.Context(), request(), now)
	if err != nil {
		t.Fatal(err)
	}
	if first.Status != "pending" || first.RecipientEmail == nil || *first.RecipientEmail != "admin@example.com" || first.Attempts != 0 {
		t.Fatalf("message=%+v", first)
	}
	before := snapshot(t, db)
	replay, err := r.Intake(t.Context(), request(), now.Add(time.Minute))
	if err != nil || !reflect.DeepEqual(first, replay) {
		t.Fatalf("replay=%+v error=%v", replay, err)
	}
	if snapshot(t, db) != before {
		t.Fatal("duplicate intake mutated state")
	}
	exec(t, db, `DELETE FROM notifications.processed_events`)
	replay, err = r.Intake(t.Context(), request(), now)
	if err != nil || replay.ID != first.ID {
		t.Fatalf("expired ledger replay=%+v/%v", replay, err)
	}
	if scalar[int](t, db, `SELECT count(*) FROM notifications.email_messages`) != 1 {
		t.Fatal("duplicate message after ledger cleanup")
	}
	if err := r.Suppress(t.Context(), "ADMIN@example.com", "manual", nil, now); err != nil {
		t.Fatal(err)
	}
	if yes, err := r.IsSuppressed(t.Context(), "ADMIN@EXAMPLE.COM"); err != nil || !yes {
		t.Fatalf("suppression=%v/%v", yes, err)
	}
	replay, err = r.Intake(t.Context(), request(), now)
	if err != nil || replay.Status != "suppressed" {
		t.Fatalf("pending retry not suppressed: %+v/%v", replay, err)
	}
	second := request()
	second.SourceEventID = "019a0000-0000-7000-8000-000000000003"
	suppressed, err := r.Intake(t.Context(), second, now)
	if err != nil || suppressed.Status != "suppressed" {
		t.Fatalf("new suppression=%+v/%v", suppressed, err)
	}
	for _, change := range []func(*domain.Intake){func(v *domain.Intake) { v.TemplateKey = "INVALID" }, func(v *domain.Intake) { v.SourceEventID = "bad" }, func(v *domain.Intake) { v.EventType = "orders.order_paid" }} {
		bad := request()
		change(&bad)
		before := snapshot(t, db)
		if _, err := r.Intake(t.Context(), bad, now); err == nil {
			t.Fatal("invalid input accepted")
		}
		if snapshot(t, db) != before {
			t.Fatal("invalid input mutated data")
		}
	}
	// Force failure after the ledger insert through a canonical database constraint.
	exec(t, db, `ALTER TABLE notifications.email_messages ADD CONSTRAINT test_reject_template CHECK(template_key <> 'reject')`)
	bad := request()
	bad.SourceEventID = "019a0000-0000-7000-8000-000000000004"
	bad.TemplateKey = "reject"
	before = snapshot(t, db)
	if _, err := r.Intake(t.Context(), bad, now); err == nil {
		t.Fatal("expected database failure")
	}
	if snapshot(t, db) != before {
		t.Fatal("failure committed ledger or message")
	}
	// Typed persistence data excludes encrypted/plaintext tokens, links and bodies.
	raw := scalar[string](t, db, `SELECT template_data::text FROM notifications.email_messages WHERE id=$1`, first.ID)
	var data map[string]any
	if err := json.Unmarshal([]byte(raw), &data); err != nil {
		t.Fatal(err)
	}
	if len(data) != 2 || data["display_name"] != "Admin" || data["admin_user_id"] != request().TemplateData.AdminUserID {
		t.Fatalf("unexpected persisted data=%s", raw)
	}
}

func TestConcurrentIntake(t *testing.T) {
	db, pool := database(t)
	if err := postgres.Migrate(t.Context(), db); err != nil {
		t.Fatal(err)
	}
	r := postgres.NewRepository(pool)
	now := time.Date(2026, 10, 20, 12, 0, 0, 0, time.UTC)
	type result struct {
		message domain.Message
		err     error
	}
	results := make(chan result, 8)
	start := make(chan struct{})
	var wg sync.WaitGroup
	for range 8 {
		wg.Go(func() { <-start; m, err := r.Intake(t.Context(), request(), now); results <- result{m, err} })
	}
	close(start)
	wg.Wait()
	close(results)
	var id string
	for result := range results {
		if result.err != nil {
			t.Fatal(result.err)
		}
		if id != "" && id != result.message.ID {
			t.Fatal("unstable message ID")
		}
		id = result.message.ID
	}
	if scalar[int](t, db, `SELECT count(*) FROM notifications.email_messages`) != 1 || scalar[int](t, db, `SELECT count(*) FROM notifications.processed_events`) != 1 {
		t.Fatal("concurrent duplicate persisted")
	}
}

func TestRetentionBoundaries(t *testing.T) {
	db, pool := database(t)
	if err := postgres.Migrate(t.Context(), db); err != nil {
		t.Fatal(err)
	}
	r := postgres.NewRepository(pool)
	now := time.Date(2026, 10, 20, 12, 0, 0, 0, time.UTC)
	for _, age := range []time.Time{now.AddDate(0, 0, -7).Add(-time.Microsecond), now.AddDate(0, 0, -7), now} {
		exec(t, db, `INSERT INTO notifications.processed_events(event_id,event_type,processed_at) VALUES(uuidv7(),'identity.password_reset_requested',$1)`, age)
	}
	for i, age := range []time.Time{now.AddDate(0, 0, -30).Add(-time.Microsecond), now.AddDate(0, 0, -30), now} {
		exec(t, db, `INSERT INTO notifications.provider_webhook_events(provider,external_event_id,event_type,received_at) VALUES('resend',$1,'email.delivered',$2)`, string(rune('a'+i)), age)
	}
	ages := []time.Time{now.AddDate(0, 0, -90).Add(-time.Microsecond), now.AddDate(0, 0, -90), now.AddDate(-2, 0, 0).Add(-time.Microsecond), now.AddDate(-2, 0, 0)}
	ids := make([]string, len(ages))
	for i, age := range ages {
		ids[i] = scalar[string](t, db, `INSERT INTO notifications.email_messages(source_event_id,template_key,recipient_email,template_data,status,created_at,updated_at) VALUES(uuidv7(),'password_reset','admin@example.com','{"display_name":"Admin"}','delivered',$1,$1) RETURNING id`, age)
	}
	if err := r.Suppress(t.Context(), "admin@example.com", "manual", nil, now.AddDate(-3, 0, 0)); err != nil {
		t.Fatal(err)
	}
	if err := r.Cleanup(t.Context(), now, 1); err != nil {
		t.Fatal(err)
	}
	if scalar[int](t, db, `SELECT count(*) FROM notifications.processed_events`) != 2 || scalar[int](t, db, `SELECT count(*) FROM notifications.provider_webhook_events`) != 2 {
		t.Fatal("ledger retention/batch boundary")
	}
	// Repeat bounded cleanup until all eligible rows have been scrubbed.
	for range 4 {
		if err := r.Cleanup(t.Context(), now, 1); err != nil {
			t.Fatal(err)
		}
	}
	for i, id := range ids {
		cleared := scalar[bool](t, db, `SELECT template_data='{}'::jsonb FROM notifications.email_messages WHERE id=$1`, id)
		anonymized := scalar[bool](t, db, `SELECT recipient_email IS NULL FROM notifications.email_messages WHERE id=$1`, id)
		if cleared != (i != 1) || anonymized != (i == 2) {
			t.Fatalf("row %d cleared=%v anonymized=%v", i, cleared, anonymized)
		}
		if scalar[string](t, db, `SELECT status FROM notifications.email_messages WHERE id=$1`, id) != "delivered" {
			t.Fatal("retention changed delivery status")
		}
	}
	if scalar[int](t, db, `SELECT count(*) FROM notifications.email_suppressions`) != 1 {
		t.Fatal("cleanup removed suppression")
	}
	before := snapshot(t, db)
	if err := r.Cleanup(t.Context(), now, 0); err == nil {
		t.Fatal("unbounded cleanup accepted")
	}
	if snapshot(t, db) != before {
		t.Fatal("invalid cleanup changed state")
	}
}
