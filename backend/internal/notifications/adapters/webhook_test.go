package adapters_test

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/freedomCruz/monte-luna/backend/internal/contracttest"
	"github.com/freedomCruz/monte-luna/backend/internal/notifications/adapters"
	"github.com/freedomCruz/monte-luna/backend/internal/notifications/domain"
)

func webhookNow() time.Time { return time.Date(2026, 10, 20, 12, 0, 0, 0, time.UTC) }
func webhookSecret() string {
	return "whsec_" + base64.StdEncoding.EncodeToString([]byte("FAKE_LOCAL_WEBHOOK_SIGNING_KEY_32"))
}
func signedRequest(body string, offset int64) *http.Request {
	req := httptest.NewRequest("POST", "/api/v1/notifications/webhooks/resend", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("svix-id", "evt_local_1")
	timestamp := strconv.FormatInt(webhookNow().Unix()+offset, 10)
	req.Header.Set("svix-timestamp", timestamp)
	mac := hmac.New(sha256.New, []byte("FAKE_LOCAL_WEBHOOK_SIGNING_KEY_32"))
	_, _ = mac.Write([]byte("evt_local_1." + timestamp + "." + body))
	req.Header.Set("svix-signature", "v1,"+base64.StdEncoding.EncodeToString(mac.Sum(nil)))
	return req
}
func wireEvent(kind string) string {
	return `{"type":"` + kind + `","created_at":"2026-10-20T12:00:00Z","data":{"email_id":"56761188-7520-42d8-8898-ff6fc54ce618","to":["Admin@example.com"],"bounce":{"type":"Permanent","subType":"General","message":"FAKE_PRIVATE_DIAGNOSTIC"},"extra":"allowed"}}`
}

type webhookStore struct {
	calls    int
	event    domain.ProviderEvent
	received time.Time
	err      error
}

func (s *webhookStore) ProcessWebhook(_ context.Context, event domain.ProviderEvent, received time.Time) error {
	s.calls++
	s.event = event
	s.received = received
	return s.err
}

func TestWebhookSignatureWindowAndRawBody(t *testing.T) {
	contract := contracttest.Load(t, "notifications.yaml")
	for _, tt := range []struct {
		name          string
		offset        int64
		mutate        func(*http.Request)
		status        int
		invalidSchema bool
	}{
		{"valid", 0, nil, 200, false}, {"past boundary", -300, nil, 200, false}, {"future boundary", 300, nil, 200, false},
		{"stale", -301, nil, 401, false}, {"future", 301, nil, 401, false},
		{"bad signature", 0, func(r *http.Request) { r.Header.Set("svix-signature", "v1,ZmFrZQ==") }, 401, false},
		{"missing id", 0, func(r *http.Request) { r.Header.Del("svix-id") }, 401, true},
		{"missing timestamp", 0, func(r *http.Request) { r.Header.Del("svix-timestamp") }, 401, true},
		{"missing signature", 0, func(r *http.Request) { r.Header.Del("svix-signature") }, 401, true},
		{"nondecimal", 0, func(r *http.Request) { r.Header.Set("svix-timestamp", "+1") }, 401, true},
		{"overflow", 0, func(r *http.Request) { r.Header.Set("svix-timestamp", strings.Repeat("9", 30)) }, 401, false},
		{"unsupported version", 0, func(r *http.Request) {
			r.Header.Set("svix-signature", strings.Replace(r.Header.Get("svix-signature"), "v1,", "v2,", 1))
		}, 401, false},
		{"rotation", 0, func(r *http.Request) {
			r.Header.Set("svix-signature", "v2,ZmFrZQ== v1,ZmFrZQ== "+r.Header.Get("svix-signature"))
		}, 200, false},
		{"duplicate header", 0, func(r *http.Request) { r.Header.Add("svix-id", "evt_other") }, 401, false},
	} {
		t.Run(tt.name, func(t *testing.T) {
			store := &webhookStore{}
			handler, err := adapters.NewResendWebhook(store, webhookSecret(), webhookNow)
			if err != nil {
				t.Fatal(err)
			}
			// Whitespace is signed exactly, never decoded and reserialized for HMAC.
			req := signedRequest(" \n"+wireEvent("email.delivered")+"\n", tt.offset)
			if tt.mutate != nil {
				tt.mutate(req)
			}
			var rec *httptest.ResponseRecorder
			if tt.invalidSchema {
				rec = contract.DoInvalid(t, handler, req)
			} else {
				rec = contract.Do(t, handler, req)
			}
			if rec.Code != tt.status {
				t.Fatalf("status=%d body=%s", rec.Code, rec.Body.String())
			}
			if tt.status == 200 {
				if rec.Body.Len() != 0 || store.calls != 1 || store.event.ExternalID != "evt_local_1" || !store.received.Equal(webhookNow()) {
					t.Fatal("invalid successful effects")
				}
			} else {
				if store.calls != 0 {
					t.Fatal("unauthenticated request reached persistence")
				}
				assertWebhookProblem(t, rec, 401, "invalid_webhook_signature")
			}
		})
	}
}
func assertWebhookProblem(t *testing.T, rec *httptest.ResponseRecorder, status int, code string) {
	t.Helper()
	var problem struct {
		Status int    `json:"status"`
		Code   string `json:"code"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &problem); err != nil {
		t.Fatal(err)
	}
	if rec.Code != status || problem.Status != status || problem.Code != code || rec.Header().Get("Content-Type") != "application/problem+json" {
		t.Fatalf("problem=%s", rec.Body.String())
	}
	if strings.Contains(rec.Body.String(), "FAKE_") {
		t.Fatal("problem disclosed private data")
	}
}
func TestWebhookValidationUnknownEventsAndRetryErrors(t *testing.T) {
	contract := contracttest.Load(t, "notifications.yaml")
	for _, tt := range []struct {
		name, body    string
		err           error
		status        int
		code          string
		calls         int
		invalidSchema bool
	}{
		{"unsupported", `{"type":"email.opened","created_at":"2026-10-20T12:00:00Z","data":{}}`, nil, 200, "", 0, false},
		{"malformed", "{", nil, 400, "invalid_json", 0, true},
		{"missing envelope", `{"type":"email.delivered"}`, nil, 422, "validation_failed", 0, true},
		{"invalid date", strings.Replace(wireEvent("email.delivered"), "2026-10-20T12:00:00Z", "wrong", 1), nil, 422, "validation_failed", 0, true},
		// The shared OpenAPI helper does not assert the email format annotation;
		// domain validation still must reject this string with no effects.
		{"bad recipient", strings.Replace(wireEvent("email.delivered"), "Admin@example.com", "invalid", 1), nil, 422, "validation_failed", 0, false},
		{"missing bounce", `{"type":"email.bounced","created_at":"2026-10-20T12:00:00Z","data":{"email_id":"id","to":["admin@example.com"]}}`, nil, 422, "validation_failed", 0, true},
		{"null optional field", strings.Replace(wireEvent("email.delivered"), `"extra":"allowed"`, `"from":null`, 1), nil, 422, "validation_failed", 0, true},
		{"null tag value", strings.Replace(wireEvent("email.delivered"), `"extra":"allowed"`, `"tags":{"name":null}`, 1), nil, 422, "validation_failed", 0, true},
		{"null bounce diagnostic", strings.Replace(wireEvent("email.bounced"), `"message":"FAKE_PRIVATE_DIAGNOSTIC"`, `"message":null`, 1), nil, 422, "validation_failed", 0, true},
		{"unknown message", wireEvent("email.delivered"), domain.ErrMessageNotFound, 503, "notification_message_not_found", 1, false},
		{"database error", wireEvent("email.complained"), errors.New("FAKE_PRIVATE_DIAGNOSTIC"), 503, "dependency_unavailable", 1, false},
	} {
		t.Run(tt.name, func(t *testing.T) {
			store := &webhookStore{err: tt.err}
			handler, err := adapters.NewResendWebhook(store, webhookSecret(), webhookNow)
			if err != nil {
				t.Fatal(err)
			}
			req := signedRequest(tt.body, 0)
			var rec *httptest.ResponseRecorder
			if tt.invalidSchema {
				rec = contract.DoInvalid(t, handler, req)
			} else {
				rec = contract.Do(t, handler, req)
			}
			if store.calls != tt.calls {
				t.Fatalf("calls=%d", store.calls)
			}
			if tt.status != 200 {
				assertWebhookProblem(t, rec, tt.status, tt.code)
			} else if rec.Code != 200 || rec.Body.Len() != 0 {
				t.Fatalf("unsupported=%d/%s", rec.Code, rec.Body.String())
			}
		})
	}
	// Invalid authentication takes precedence over malformed JSON and never reaches storage.
	store := &webhookStore{}
	handler, err := adapters.NewResendWebhook(store, webhookSecret(), webhookNow)
	if err != nil {
		t.Fatal(err)
	}
	req := signedRequest("{", 0)
	req.Header.Set("svix-signature", "v1,ZmFrZQ==")
	rec := contract.DoInvalid(t, handler, req)
	assertWebhookProblem(t, rec, 401, "invalid_webhook_signature")
	for _, secret := range []string{"whsec_!!!", "whsec_"} {
		if _, err := adapters.NewResendWebhook(store, secret, webhookNow); err == nil {
			t.Fatal("invalid signing secret accepted")
		}
	}
}
