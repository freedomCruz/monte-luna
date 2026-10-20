package adapters_test

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/freedomCruz/monte-luna/backend/internal/notifications/adapters"
	"github.com/freedomCruz/monte-luna/backend/internal/notifications/domain"
)

const providerID = "49a3999c-0ce1-4ea6-ab68-afcd6dc2e794"

func outboundEmail() domain.Email {
	return domain.Email{MessageID: "019a0000-0000-7000-8000-000000000009", Recipient: "admin@example.test", Subject: "Approved subject", HTML: "<p>FAKE_TOKEN</p>", Text: "FAKE_TOKEN"}
}

type routeToLocal struct {
	target    *url.URL
	transport http.RoundTripper
}

func (r routeToLocal) RoundTrip(req *http.Request) (*http.Response, error) {
	if req.URL.String() != "https://api.resend.com/emails" {
		return nil, errors.New("unexpected provider endpoint")
	}
	clone := req.Clone(req.Context())
	clone.URL.Scheme = r.target.Scheme
	clone.URL.Host = r.target.Host
	clone.Host = r.target.Host
	return r.transport.RoundTrip(clone)
}
func localClient(t *testing.T, server *httptest.Server) *http.Client {
	t.Helper()
	target, err := url.Parse(server.URL)
	if err != nil {
		t.Fatal(err)
	}
	return &http.Client{Timeout: time.Second, Transport: routeToLocal{target: target, transport: server.Client().Transport}}
}
func TestResendRequestAndStableIdempotencyKey(t *testing.T) {
	var calls atomic.Int32
	var first string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		if r.Method != "POST" || r.URL.Path != "/emails" || r.Header.Get("Authorization") != "Bearer FAKE_API_KEY" || r.Header.Get("Content-Type") != "application/json" || r.Header.Get("Idempotency-Key") != outboundEmail().MessageID {
			t.Error("incorrect Resend request metadata")
		}
		body, err := io.ReadAll(r.Body)
		if err != nil {
			t.Error(err)
			return
		}
		if calls.Load() == 1 {
			first = string(body)
		} else if string(body) != first {
			t.Error("retry changed request body")
		}
		var payload struct {
			From    string   `json:"from"`
			To      []string `json:"to"`
			Subject string   `json:"subject"`
			HTML    string   `json:"html"`
			Text    string   `json:"text"`
		}
		if err := json.Unmarshal(body, &payload); err != nil {
			t.Error(err)
			return
		}
		want := outboundEmail()
		if payload.From != "Monteluna <mail@example.test>" || len(payload.To) != 1 || payload.To[0] != want.Recipient || payload.Subject != want.Subject || payload.HTML != want.HTML || payload.Text != want.Text {
			t.Error("missing approved Resend payload fields")
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = io.WriteString(w, `{"id":"`+providerID+`"}`)
	}))
	defer server.Close()
	client := localClient(t, server)
	sender, err := adapters.NewResendSender("FAKE_API_KEY", "Monteluna <mail@example.test>", client)
	if err != nil {
		t.Fatal(err)
	}
	for range 2 {
		result, err := sender.Send(t.Context(), outboundEmail())
		if err != nil || result.Provider != "resend" || result.MessageID != providerID {
			t.Fatalf("result=%+v error=%v", result, err)
		}
	}
	if calls.Load() != 2 {
		t.Fatal("unexpected hidden retries")
	}
}
func TestResendFailuresAreSecretSafeAndReturnedForOutboxRetry(t *testing.T) {
	for _, tt := range []struct {
		name   string
		status int
		body   string
	}{
		{"rate limit", 429, `{"message":"FAKE_TOKEN FAKE_API_KEY"}`},
		{"server error", 503, "FAKE_TOKEN FAKE_API_KEY"},
		{"rejected", 422, "FAKE_TOKEN FAKE_API_KEY"},
		{"malformed", 200, "FAKE_TOKEN"},
		{"missing id", 200, `{}`},
		{"unsafe id", 200, `{"id":"https://example.test/?token=FAKE_TOKEN"}`},
		{"oversized", 200, strings.Repeat("FAKE_TOKEN", 10000)},
	} {
		t.Run(tt.name, func(t *testing.T) {
			var calls atomic.Int32
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				calls.Add(1)
				w.Header().Set("Retry-After", "999")
				w.WriteHeader(tt.status)
				_, _ = io.WriteString(w, tt.body)
			}))
			defer server.Close()
			sender, err := adapters.NewResendSender("FAKE_API_KEY", "mail@example.test", localClient(t, server))
			if err != nil {
				t.Fatal(err)
			}
			result, err := sender.Send(t.Context(), outboundEmail())
			if err == nil || result != (domain.SendResult{}) {
				t.Fatalf("accepted failure result=%+v error=%v", result, err)
			}
			if strings.Contains(err.Error(), "FAKE_TOKEN") || strings.Contains(err.Error(), "FAKE_API_KEY") || strings.Contains(err.Error(), server.URL) {
				t.Fatal("failure exposed provider/transport content")
			}
			if calls.Load() != 1 {
				t.Fatal("sender retried instead of returning to relay")
			}
		})
	}
}

type failingTransport struct{ calls atomic.Int32 }

func (f *failingTransport) RoundTrip(*http.Request) (*http.Response, error) {
	f.calls.Add(1)
	return nil, errors.New("FAKE_TOKEN FAKE_API_KEY transport failure")
}
func TestResendTransportAndCancellation(t *testing.T) {
	transport := &failingTransport{}
	sender, err := adapters.NewResendSender("FAKE_API_KEY", "mail@example.test", &http.Client{Timeout: time.Second, Transport: transport})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := sender.Send(t.Context(), outboundEmail()); err == nil || strings.Contains(err.Error(), "FAKE_") {
		t.Fatal("transport error not safely returned")
	}
	ctx, cancel := context.WithCancel(t.Context())
	cancel()
	if _, err := sender.Send(ctx, outboundEmail()); err == nil {
		t.Fatal("cancelled send accepted")
	}
	if transport.calls.Load() != 1 {
		t.Fatal("cancelled send attempted network I/O")
	}
	ctx, cancel = context.WithDeadline(t.Context(), time.Now().Add(-time.Second))
	defer cancel()
	if _, err := sender.Send(ctx, outboundEmail()); err == nil {
		t.Fatal("expired timeout accepted")
	}
	if transport.calls.Load() != 1 {
		t.Fatal("expired request attempted I/O")
	}
}
func TestResendRejectsRedirectsAndPreservesCallerClient(t *testing.T) {
	var calls atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		w.Header().Set("Location", "https://attacker.example.test/steal")
		w.WriteHeader(http.StatusTemporaryRedirect)
	}))
	defer server.Close()
	client := localClient(t, server)
	sender, err := adapters.NewResendSender("FAKE_API_KEY", "mail@example.test", client)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := sender.Send(t.Context(), outboundEmail()); err == nil {
		t.Fatal("redirect accepted")
	}
	if calls.Load() != 1 || client.CheckRedirect != nil {
		t.Fatal("redirect followed or shared caller client mutated")
	}
}
func TestResendValidationPreventsIO(t *testing.T) {
	transport := &failingTransport{}
	client := &http.Client{Timeout: time.Second, Transport: transport}
	for _, tt := range []struct {
		key, from string
		client    *http.Client
	}{
		{"", "mail@example.test", client}, {"FAKE\r\nKEY", "mail@example.test", client}, {"FAKE", "invalid", client}, {"FAKE", "mail@example.test", nil}, {"FAKE", "mail@example.test", &http.Client{}},
	} {
		if _, err := adapters.NewResendSender(tt.key, tt.from, tt.client); err == nil {
			t.Fatal("invalid configuration accepted")
		}
	}
	sender, err := adapters.NewResendSender("FAKE_API_KEY", "mail@example.test", client)
	if err != nil {
		t.Fatal(err)
	}
	for _, change := range []func(*domain.Email){func(e *domain.Email) { e.MessageID = "bad\r\nkey" }, func(e *domain.Email) { e.Recipient = "bad" }, func(e *domain.Email) { e.HTML = "" }, func(e *domain.Email) { e.Text = "" }, func(e *domain.Email) { e.Subject = "" }} {
		email := outboundEmail()
		change(&email)
		if _, err := sender.Send(t.Context(), email); err == nil {
			t.Fatal("invalid email accepted")
		}
	}
	if transport.calls.Load() != 0 {
		t.Fatal("invalid input caused I/O")
	}
}
