package postgres_test

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/freedomCruz/monte-luna/backend/internal/contracttest"
	"github.com/freedomCruz/monte-luna/backend/internal/notifications/adapters"
	"github.com/freedomCruz/monte-luna/backend/internal/notifications/adapters/postgres"
)

func TestSignedWebhookPublicHTTPAtomicEffects(t *testing.T) {
	db, pool := database(t)
	if err := postgres.Migrate(t.Context(), db); err != nil {
		t.Fatal(err)
	}
	r := postgres.NewRepository(pool)
	now := time.Date(2026, 10, 20, 12, 0, 0, 0, time.UTC)
	key := []byte("FAKE_HTTP_INTEGRATION_SIGNING_KEY")
	handler, err := adapters.NewResendWebhook(r, "whsec_"+base64.StdEncoding.EncodeToString(key), func() time.Time { return now })
	if err != nil {
		t.Fatal(err)
	}
	contract := contracttest.Load(t, "notifications.yaml")
	send := func(kind, id string, validSignature bool) *httptest.ResponseRecorder {
		body := fmt.Sprintf(`{"type":%q,"created_at":"2026-10-20T12:00:00Z","data":{"email_id":%q,"to":["ADMIN@example.com"],"bounce":{"type":"Permanent"}}}`, kind, webhookProviderID)
		req := httptest.NewRequest("POST", "/api/v1/notifications/webhooks/resend", strings.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		ts := strconv.FormatInt(now.Unix(), 10)
		req.Header.Set("svix-id", id)
		req.Header.Set("svix-timestamp", ts)
		mac := hmac.New(sha256.New, key)
		_, _ = mac.Write([]byte(id + "." + ts + "." + body))
		signature := base64.StdEncoding.EncodeToString(mac.Sum(nil))
		if !validSignature {
			signature = "ZmFrZQ=="
		}
		req.Header.Set("svix-signature", "v1,"+signature)
		return contract.Do(t, handler, req)
	}
	before := snapshot(t, db)
	for _, tt := range []struct {
		kind, id string
		valid    bool
		status   int
	}{
		{"email.complained", "evt_invalid", false, http.StatusUnauthorized},
		{"email.opened", "evt_ignore", true, http.StatusOK},
		{"email.bounced", "evt_race", true, http.StatusServiceUnavailable},
	} {
		rec := send(tt.kind, tt.id, tt.valid)
		if rec.Code != tt.status {
			t.Fatalf("status=%d body=%s", rec.Code, rec.Body.String())
		}
		if snapshot(t, db) != before {
			t.Fatal("rejected/ignored/unmatched HTTP request changed stored data")
		}
	}
	storedWebhookMessage(t, db, r, now)
	rec := send("email.bounced", "evt_race", true)
	if rec.Code != 200 || rec.Body.Len() != 0 {
		t.Fatalf("retry=%d/%s", rec.Code, rec.Body.String())
	}
	if scalar[string](t, db, `SELECT status FROM notifications.email_messages`) != "bounced" || scalar[int](t, db, `SELECT count(*) FROM notifications.provider_webhook_events`) != 1 || scalar[int](t, db, `SELECT count(*) FROM notifications.email_suppressions`) != 1 {
		t.Fatal("successful HTTP retry did not atomically apply effects")
	}
	before = snapshot(t, db)
	if rec := send("email.bounced", "evt_race", true); rec.Code != 200 || rec.Body.Len() != 0 {
		t.Fatal("duplicate HTTP event not acknowledged")
	}
	if rec := send("email.bounced", "evt_race", false); rec.Code != 401 {
		t.Fatal("duplicate skipped authentication")
	}
	if snapshot(t, db) != before {
		t.Fatal("duplicate or invalid signature changed data/counters")
	}
	if rec := send("email.complained", "evt_complaint", true); rec.Code != 200 {
		t.Fatal("complaint HTTP failed")
	}
	if scalar[string](t, db, `SELECT status FROM notifications.email_messages`) != "complained" || scalar[int](t, db, `SELECT count(*) FROM notifications.provider_webhook_events`) != 2 || scalar[int](t, db, `SELECT count(*) FROM notifications.email_suppressions`) != 1 {
		t.Fatal("complaint status/deduplication changed unexpectedly")
	}
}
