package app_test

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/freedomCruz/monte-luna/backend/internal/notifications/adapters"
	"github.com/freedomCruz/monte-luna/backend/internal/notifications/app"
	"github.com/freedomCruz/monte-luna/backend/internal/notifications/domain"
)

const fakeToken = "FAKE_ONE_TIME_TOKEN"

var fixedNow = time.Date(2026, 10, 20, 12, 0, 0, 0, time.UTC)

type store struct {
	message               domain.Message
	intakes, sent, failed int
	suppressed            bool
	err                   error
	input                 domain.Intake
}

func (s *store) Intake(_ context.Context, in domain.Intake, _ time.Time) (domain.Message, error) {
	s.intakes++
	s.input = in
	if s.err != nil {
		return domain.Message{}, s.err
	}
	if s.message.ID == "" {
		email := strings.ToLower(in.RecipientEmail)
		s.message = domain.Message{ID: "019a0000-0000-7000-8000-000000000009", SourceEventID: in.SourceEventID, TemplateKey: in.TemplateKey, RecipientEmail: &email, TemplateData: in.TemplateData, Status: "pending"}
	}
	if s.suppressed && (s.message.Status == "pending" || s.message.Status == "failed") {
		s.message.Status = "suppressed"
	}
	return s.message, nil
}
func (s *store) IsSuppressed(context.Context, string) (bool, error) { return s.suppressed, s.err }
func (s *store) RecordSent(_ context.Context, _ string, result domain.SendResult, _ time.Time) error {
	s.sent++
	s.message.Status = "sent"
	s.message.Provider = result.Provider
	return s.err
}
func (s *store) RecordFailure(context.Context, string, time.Time) error {
	s.failed++
	s.message.Status = "failed"
	return s.err
}

type decryptor struct {
	calls int
	err   error
}

func (d *decryptor) Decrypt(_ context.Context, adminUserID, value string) (string, error) {
	d.calls++
	if adminUserID == "" || value != "FAKE_CIPHERTEXT" {
		return "", errors.New("unexpected ciphertext")
	}
	return fakeToken, d.err
}

type links struct {
	eventType, token string
	err              error
}

func (l *links) Build(_ context.Context, eventType, token string) (string, error) {
	l.eventType = eventType
	l.token = token
	return "https://example.test/identity-action?token=" + token, l.err
}

type failedSender struct{}

func (failedSender) Send(context.Context, domain.Email) (domain.SendResult, error) {
	return domain.SendResult{}, errors.New(fakeToken)
}
func event(kind string) domain.Event {
	return domain.Event{ID: "019a0000-0000-7000-8000-000000000001", Type: kind, Payload: []byte(`{"admin_user_id":"019a0000-0000-7000-8000-000000000002","email":"Admin@example.test","display_name":"Admin","raw_token_encrypted":"FAKE_CIPHERTEXT","role":"staff"}`)}
}

func TestConsumerKeepsSecretsInMemoryAndDeduplicates(t *testing.T) {
	for _, kind := range []string{"identity.password_reset_requested", "identity.admin_invited"} {
		t.Run(kind, func(t *testing.T) {
			s := &store{}
			d := &decryptor{}
			l := &links{}
			capture := adapters.NewCaptureSender()
			renderer, err := adapters.NewTemplateRenderer()
			if err != nil {
				t.Fatal(err)
			}
			consumer := app.NewConsumer(s, renderer, capture, d, l, func() time.Time { return fixedNow })
			if err := consumer.Handle(t.Context(), event(kind)); err != nil {
				t.Fatal(err)
			}
			if err := consumer.Handle(t.Context(), event(kind)); err != nil {
				t.Fatal(err)
			}
			if s.sent != 1 || s.failed != 0 || d.calls != 1 || len(capture.Messages()) != 1 || s.message.Status != "sent" {
				t.Fatalf("sent=%d failed=%d decrypt=%d", s.sent, s.failed, d.calls)
			}
			if l.eventType != kind || l.token != fakeToken {
				t.Fatal("incorrect one-time-link boundary")
			}
			email := capture.Messages()[0]
			if email.MessageID != s.message.ID || email.Recipient != "admin@example.test" || !strings.Contains(email.Text, fakeToken) {
				t.Fatal("incorrect captured email")
			}
			raw, err := json.Marshal(s.input)
			if err != nil {
				t.Fatal(err)
			}
			for _, secret := range []string{fakeToken, "FAKE_CIPHERTEXT", "https://", "raw_token_encrypted"} {
				if strings.Contains(string(raw), secret) {
					t.Fatalf("secret persisted: %s", secret)
				}
			}
			if kind == "identity.admin_invited" && (!strings.Contains(email.Text, "rol de equipo") || s.input.TemplateKey != "admin_invitation") {
				t.Fatal("invitation template/role missing")
			}
		})
	}
}
func TestConsumerAdminInvitedOwnerRendersPropietario(t *testing.T) {
	s := &store{}
	d := &decryptor{}
	l := &links{}
	capture := adapters.NewCaptureSender()
	renderer, err := adapters.NewTemplateRenderer()
	if err != nil {
		t.Fatal(err)
	}
	consumer := app.NewConsumer(s, renderer, capture, d, l, func() time.Time { return fixedNow })
	ownerEv := domain.Event{
		ID:   "019a0000-0000-7000-8000-000000000001",
		Type: "identity.admin_invited",
		Payload: []byte(`{"admin_user_id":"019a0000-0000-7000-8000-000000000002","email":"owner@example.test","display_name":"Owner","raw_token_encrypted":"FAKE_CIPHERTEXT","role":"owner"}`),
	}
	if err := consumer.Handle(t.Context(), ownerEv); err != nil {
		t.Fatal(err)
	}
	if s.sent != 1 || len(capture.Messages()) != 1 {
		t.Fatalf("sent=%d messages=%d", s.sent, len(capture.Messages()))
	}
	email := capture.Messages()[0]
	if !strings.Contains(email.HTML, "rol de propietario") || !strings.Contains(email.Text, "rol de propietario") {
		t.Fatalf("expected 'rol de propietario' in HTML and text, got text=%q", email.Text)
	}
}

func TestSuppressedConsumerSkipsDecryptionAndDispatch(t *testing.T) {
	s := &store{suppressed: true}
	d := &decryptor{}
	l := &links{}
	capture := adapters.NewCaptureSender()
	renderer, err := adapters.NewTemplateRenderer()
	if err != nil {
		t.Fatal(err)
	}
	c := app.NewConsumer(s, renderer, capture, d, l, func() time.Time { return fixedNow })
	if err := c.Handle(t.Context(), event("identity.password_reset_requested")); err != nil {
		t.Fatal(err)
	}
	if s.message.Status != "suppressed" || d.calls != 0 || s.sent != 0 || len(capture.Messages()) != 0 {
		t.Fatal("suppressed event decrypted or dispatched")
	}
}
func TestConsumerRejectsInvalidInputWithoutEffects(t *testing.T) {
	for _, tt := range []struct {
		name  string
		event domain.Event
	}{
		{"unsupported", event("orders.order_paid")},
		{"malformed", domain.Event{ID: event("").ID, Type: "identity.password_reset_requested", Payload: []byte("{")}},
		{"missing ciphertext", domain.Event{ID: event("").ID, Type: "identity.password_reset_requested", Payload: []byte(`{"email":"admin@example.test"}`)}},
		{"missing role", domain.Event{ID: event("").ID, Type: "identity.admin_invited", Payload: []byte(`{"admin_user_id":"019a0000-0000-7000-8000-000000000002","email":"admin@example.test","raw_token_encrypted":"FAKE_CIPHERTEXT"}`)}},
		{"empty role", domain.Event{ID: event("").ID, Type: "identity.admin_invited", Payload: []byte(`{"admin_user_id":"019a0000-0000-7000-8000-000000000002","email":"admin@example.test","raw_token_encrypted":"FAKE_CIPHERTEXT","role":""}`)}},
		{"unknown role", domain.Event{ID: event("").ID, Type: "identity.admin_invited", Payload: []byte(`{"admin_user_id":"019a0000-0000-7000-8000-000000000002","email":"admin@example.test","raw_token_encrypted":"FAKE_CIPHERTEXT","role":"other"}`)}},
		{"spanish role in payload", domain.Event{ID: event("").ID, Type: "identity.admin_invited", Payload: []byte(`{"admin_user_id":"019a0000-0000-7000-8000-000000000002","email":"admin@example.test","raw_token_encrypted":"FAKE_CIPHERTEXT","role":"equipo"}`)}},
	} {
		t.Run(tt.name, func(t *testing.T) {
			s := &store{}
			d := &decryptor{}
			capture := adapters.NewCaptureSender()
			renderer, err := adapters.NewTemplateRenderer()
			if err != nil {
				t.Fatal(err)
			}
			c := app.NewConsumer(s, renderer, capture, d, &links{}, func() time.Time { return fixedNow })
			if err := c.Handle(t.Context(), tt.event); err == nil {
				t.Fatal("invalid event accepted")
			}
			if s.intakes != 0 || s.sent != 0 || s.failed != 0 || d.calls != 0 || len(capture.Messages()) != 0 {
				t.Fatal("invalid event caused effects")
			}
		})
	}
}
func TestConsumerFailuresAreRetryableAndSecretSafe(t *testing.T) {
	for _, failure := range []string{"decrypt", "link", "send"} {
		t.Run(failure, func(t *testing.T) {
			s := &store{}
			d := &decryptor{}
			l := &links{}
			capture := adapters.NewCaptureSender()
			var sender domain.EmailSender = capture
			if failure == "decrypt" {
				d.err = errors.New(fakeToken)
			}
			if failure == "link" {
				l.err = errors.New(fakeToken)
			}
			if failure == "send" {
				sender = failedSender{}
			}
			renderer, err := adapters.NewTemplateRenderer()
			if err != nil {
				t.Fatal(err)
			}
			c := app.NewConsumer(s, renderer, sender, d, l, func() time.Time { return fixedNow })
			err = c.Handle(t.Context(), event("identity.password_reset_requested"))
			if err == nil || strings.Contains(err.Error(), fakeToken) || s.failed != 1 || s.sent != 0 || s.message.Status != "failed" {
				t.Fatalf("failure state/error=%v", err)
			}
			id := s.message.ID
			d.err = nil
			l.err = nil
			c = app.NewConsumer(s, renderer, capture, d, l, func() time.Time { return fixedNow })
			if err := c.Handle(t.Context(), event("identity.password_reset_requested")); err != nil {
				t.Fatal(err)
			}
			if s.message.ID != id || s.message.Status != "sent" || len(capture.Messages()) != 1 {
				t.Fatal("retry failed or changed idempotency key")
			}
		})
	}
}
