package postgres_test

import (
	"context"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/freedomCruz/monte-luna/backend/internal/notifications/adapters"
	"github.com/freedomCruz/monte-luna/backend/internal/notifications/adapters/postgres"
	"github.com/freedomCruz/monte-luna/backend/internal/notifications/app"
	"github.com/freedomCruz/monte-luna/backend/internal/notifications/domain"
	"github.com/freedomCruz/monte-luna/backend/internal/platform"
)

type localResendTransport struct {
	target    *url.URL
	transport http.RoundTripper
}

func (r localResendTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	if req.URL.String() != "https://api.resend.com/emails" {
		return nil, errors.New("unexpected provider endpoint")
	}
	clone := req.Clone(req.Context())
	clone.URL.Scheme = r.target.Scheme
	clone.URL.Host = r.target.Host
	clone.Host = r.target.Host
	return r.transport.RoundTrip(clone)
}

func TestResendOutageRetriesWithoutRevertingProducer(t *testing.T) {
	db, pool := database(t)
	if err := postgres.Migrate(t.Context(), db); err != nil {
		t.Fatal(err)
	}
	now := time.Date(2026, 10, 20, 12, 0, 0, 0, time.UTC)
	// Disposable producer fixture: business effect and encrypted event commit
	// before the relay is invoked. Notifications never queries these tables.
	exec(t, db, `CREATE SCHEMA producer;
 CREATE TABLE producer.operations(id uuid PRIMARY KEY,value text NOT NULL);
 CREATE TABLE producer.outbox(id uuid PRIMARY KEY,type text NOT NULL,occurred_at timestamptz NOT NULL,payload jsonb NOT NULL,status text NOT NULL DEFAULT 'pending',available_at timestamptz NOT NULL,attempts integer NOT NULL DEFAULT 0,delivered_at timestamptz,last_error text,updated_at timestamptz NOT NULL);`)
	tx, err := db.BeginTx(t.Context(), nil)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = tx.Rollback() }()
	if _, err := tx.ExecContext(t.Context(), `INSERT INTO producer.operations VALUES($1,'committed business operation')`, request().SourceEventID); err != nil {
		t.Fatal(err)
	}
	payload := `{"admin_user_id":"019a0000-0000-7000-8000-000000000002","email":"admin@example.test","display_name":"Admin","raw_token_encrypted":"FAKE_CIPHERTEXT"}`
	if _, err := tx.ExecContext(t.Context(), `INSERT INTO producer.outbox(id,type,occurred_at,payload,available_at,updated_at) VALUES($1,'identity.password_reset_requested',$2,$3,$2,$2)`, request().SourceEventID, now, payload); err != nil {
		t.Fatal(err)
	}
	if err := tx.Commit(); err != nil {
		t.Fatal(err)
	}
	var mu sync.Mutex
	var keys, bodies []string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, err := io.ReadAll(r.Body)
		if err != nil {
			t.Error(err)
			return
		}
		mu.Lock()
		defer mu.Unlock()
		keys = append(keys, r.Header.Get("Idempotency-Key"))
		bodies = append(bodies, string(body))
		if len(keys) == 1 {
			w.WriteHeader(http.StatusServiceUnavailable)
			_, _ = io.WriteString(w, "FAKE_TOKEN FAKE_API_KEY")
			return
		}
		_, _ = io.WriteString(w, `{"id":"49a3999c-0ce1-4ea6-ab68-afcd6dc2e794"}`)
	}))
	defer server.Close()
	target, err := url.Parse(server.URL)
	if err != nil {
		t.Fatal(err)
	}
	sender, err := adapters.NewResendSender("FAKE_API_KEY", "mail@example.test", &http.Client{Timeout: time.Second, Transport: localResendTransport{target: target, transport: server.Client().Transport}})
	if err != nil {
		t.Fatal(err)
	}
	renderer, err := adapters.NewTemplateRenderer()
	if err != nil {
		t.Fatal(err)
	}
	consumer := app.NewConsumer(postgres.NewRepository(pool), renderer, sender, localDecryptor{}, localLinks{}, func() time.Time { return now })
	relay, err := platform.NewRelay(pool, []string{"producer"}, platform.DefaultRelayConfig(), slog.New(slog.NewTextHandler(io.Discard, nil)))
	if err != nil {
		t.Fatal(err)
	}
	relay.Subscribe("identity.password_reset_requested", func(ctx context.Context, event platform.Event) error {
		return consumer.Handle(ctx, domain.Event{ID: event.ID, Type: event.Type, Payload: event.Payload})
	})
	if n, err := relay.Poll(t.Context(), now); err != nil || n != 1 {
		t.Fatalf("first poll=%d/%v", n, err)
	}
	if scalar[string](t, db, `SELECT value FROM producer.operations`) != "committed business operation" {
		t.Fatal("outage reverted producer")
	}
	if scalar[string](t, db, `SELECT status FROM producer.outbox`) != "pending" || scalar[int](t, db, `SELECT attempts FROM producer.outbox`) != 1 || scalar[string](t, db, `SELECT status FROM notifications.email_messages`) != "failed" {
		t.Fatal("outage not queued for retry")
	}
	id := scalar[string](t, db, `SELECT id FROM notifications.email_messages`)
	if n, err := relay.Poll(t.Context(), now); err != nil || n != 0 {
		t.Fatalf("backoff not respected: %d/%v", n, err)
	}
	now = now.Add(time.Second)
	if n, err := relay.Poll(t.Context(), now); err != nil || n != 1 {
		t.Fatalf("retry=%d/%v", n, err)
	}
	if scalar[string](t, db, `SELECT status FROM producer.outbox`) != "delivered" || scalar[string](t, db, `SELECT status FROM notifications.email_messages`) != "sent" || scalar[int](t, db, `SELECT attempts FROM notifications.email_messages`) != 2 {
		t.Fatal("retry did not complete")
	}
	if scalar[string](t, db, `SELECT provider FROM notifications.email_messages`) != "resend" || scalar[string](t, db, `SELECT provider_message_id FROM notifications.email_messages`) != "49a3999c-0ce1-4ea6-ab68-afcd6dc2e794" {
		t.Fatal("provider metadata not persisted")
	}
	before := snapshot(t, db)
	if n, err := relay.Poll(t.Context(), now); err != nil || n != 0 {
		t.Fatalf("completed event replayed: %d/%v", n, err)
	}
	if snapshot(t, db) != before || scalar[string](t, db, `SELECT value FROM producer.operations`) != "committed business operation" {
		t.Fatal("completion changed stored business state")
	}
	mu.Lock()
	defer mu.Unlock()
	if len(keys) != 2 || keys[0] != id || keys[1] != id || bodies[0] != bodies[1] {
		t.Fatal("outbox retry changed stable key/body")
	}
	for _, secret := range []string{"FAKE_TOKEN", "FAKE_API_KEY", "https://"} {
		if strings.Contains(snapshot(t, db), secret) || strings.Contains(scalar[string](t, db, `SELECT coalesce(last_error,'') FROM producer.outbox`), secret) {
			t.Fatal("failure leaked provider secrets")
		}
	}
}
