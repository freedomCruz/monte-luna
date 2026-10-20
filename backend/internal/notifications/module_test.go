package notifications

import (
	"context"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/freedomCruz/monte-luna/backend/internal/platform"
	"github.com/jackc/pgx/v5/pgxpool"
)

// lazyPool never connects: route mounting and request rejection before storage
// must not need a database.
func lazyPool(t *testing.T) *pgxpool.Pool {
	t.Helper()
	pool, err := pgxpool.New(t.Context(), "postgres://fixture:fixture@127.0.0.1:1/fixture")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(pool.Close)
	return pool
}

func moduleFor(t *testing.T, values map[string]string) *Module {
	t.Helper()
	cfg, err := LoadConfig(func(name string) string { return values[name] })
	if err != nil {
		t.Fatal(err)
	}
	module, err := build(lazyPool(t), cfg, slog.New(slog.NewTextHandler(io.Discard, nil)), Options{})
	if err != nil {
		t.Fatal(err)
	}
	return module
}

func TestWebhookRouteMountedOnlyWithResend(t *testing.T) {
	for _, tt := range []struct {
		name   string
		values map[string]string
		status int
	}{
		{"capture default", map[string]string{}, http.StatusNotFound},
		{"explicit capture", map[string]string{"NOTIFICATIONS_EMAIL_SENDER": "capture"}, http.StatusNotFound},
		// An unsigned request reaches the mounted handler and is rejected before storage.
		{"resend", map[string]string{"NOTIFICATIONS_EMAIL_SENDER": "resend", "RESEND_API_KEY": "re_fixture", "RESEND_FROM": "no-reply@mail.example.test", "RESEND_WEBHOOK_SECRET": "whsec_Zml4dHVyZQ=="}, http.StatusUnauthorized},
	} {
		t.Run(tt.name, func(t *testing.T) {
			module := moduleFor(t, tt.values)
			mux := http.NewServeMux()
			module.RegisterRoutes(mux)
			response := httptest.NewRecorder()
			mux.ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/api/v1/notifications/webhooks/resend", strings.NewReader("{}")))
			if response.Code != tt.status {
				t.Fatalf("status=%d want %d", response.Code, tt.status)
			}
		})
	}
}

func TestSenderSelection(t *testing.T) {
	if _, ok := moduleFor(t, map[string]string{}).sender.(interface{ Messages() []Email }); !ok {
		t.Fatal("capture configuration did not select the in-memory capture sender")
	}
	resend := moduleFor(t, map[string]string{"NOTIFICATIONS_EMAIL_SENDER": "resend", "RESEND_API_KEY": "re_fixture", "RESEND_FROM": "no-reply@mail.example.test", "RESEND_WEBHOOK_SECRET": "whsec_Zml4dHVyZQ=="})
	if _, ok := resend.sender.(interface{ Messages() []Email }); ok {
		t.Fatal("resend configuration selected the capture sender")
	}
}

func TestCleanupUsesBoundedRepositoryCleanup(t *testing.T) {
	module := moduleFor(t, map[string]string{})
	now := time.Date(2026, 10, 20, 12, 0, 0, 0, time.UTC)
	var gotNow time.Time
	var gotBatch int32
	failure := errors.New("cleanup failed")
	module.cleanup = func(_ context.Context, at time.Time, batch int32) error {
		gotNow, gotBatch = at, batch
		return failure
	}
	if err := module.Cleanup(t.Context(), now); !errors.Is(err, failure) {
		t.Fatalf("error=%v", err)
	}
	if !gotNow.Equal(now) || gotBatch != cleanupBatchSize || cleanupBatchSize <= 0 {
		t.Fatalf("cleanup at=%s batch=%d", gotNow, gotBatch)
	}
}

func TestRunJobsCleansOnEveryTickUntilCancelled(t *testing.T) {
	module := moduleFor(t, map[string]string{})
	ticks := make(chan time.Time)
	calls := make(chan time.Time)
	module.cleanup = func(_ context.Context, at time.Time, _ int32) error {
		calls <- at
		return errors.New("transient failure must not stop the loop")
	}
	ctx, cancel := context.WithCancel(t.Context())
	done := make(chan struct{})
	go func() { defer close(done); module.runJobs(ctx, ticks) }()
	first := time.Date(2026, 10, 20, 12, 0, 0, 0, time.UTC)
	for _, tick := range []time.Time{first, first.Add(time.Hour)} {
		ticks <- tick
		if got := <-calls; !got.Equal(tick) {
			t.Fatalf("cleanup at %s want %s", got, tick)
		}
	}
	cancel()
	<-done
}

func TestRunJobsRejectsNonPositiveInterval(t *testing.T) {
	module := moduleFor(t, map[string]string{})
	module.cleanup = func(context.Context, time.Time, int32) error {
		t.Fatal("cleanup ran with an invalid interval")
		return nil
	}
	module.RunJobs(t.Context(), 0)
}

type fakeDecryptor struct{}

func (fakeDecryptor) Decrypt(context.Context, string) (string, error) { return "token", nil }

type fakeLinks struct{}

func (fakeLinks) Build(context.Context, string, string) (string, error) {
	return "https://admin.example.test/link", nil
}

func TestConsumerRequiresIdentityPorts(t *testing.T) {
	module := moduleFor(t, map[string]string{})
	if _, err := module.Consumer(nil, fakeLinks{}); err == nil {
		t.Fatal("consumer accepted a missing token decryptor")
	}
	if _, err := module.Consumer(fakeDecryptor{}, nil); err == nil {
		t.Fatal("consumer accepted a missing link builder")
	}
	consumer, err := module.Consumer(fakeDecryptor{}, fakeLinks{})
	if err != nil || consumer == nil {
		t.Fatalf("consumer=%v error=%v", consumer != nil, err)
	}
}

func TestConsumerRejectsUnsupportedEventBeforeStorage(t *testing.T) {
	consumer, err := moduleFor(t, map[string]string{}).Consumer(fakeDecryptor{}, fakeLinks{})
	if err != nil {
		t.Fatal(err)
	}
	if err := consumer(t.Context(), platform.Event{ID: "019a0000-0000-7000-8000-000000000001", Type: "orders.order_paid", Payload: []byte("{}")}); err == nil {
		t.Fatal("consumer accepted an unsupported event type")
	}
}
