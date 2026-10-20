package adapters

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/mail"
	"regexp"
	"strings"

	"github.com/freedomCruz/monte-luna/backend/internal/notifications/domain"
)

var (
	ErrResendUnavailable = errors.New("resend delivery unavailable")
	ErrResendRejected    = errors.New("resend delivery rejected")
	ErrResendResponse    = errors.New("invalid resend response")
)

// ResendSender makes one HTTP attempt per Send. The outbox owns scheduling,
// exponential backoff and exhaustion; retries reuse the persisted message ID.
// Provider bodies and transport errors may contain secrets and are never exposed.
type ResendSender struct {
	apiKey, from string
	client       http.Client
}

var _ domain.EmailSender = (*ResendSender)(nil)

// NewResendSender requires an explicitly bounded client. The production endpoint
// is fixed; tests inject a transport that routes requests to a local fake server.
// Copying the client prevents redirect policy changes from affecting its caller.
func NewResendSender(apiKey, from string, client *http.Client) (*ResendSender, error) {
	if client == nil || client.Timeout <= 0 || apiKey == "" || strings.ContainsAny(apiKey, " \t\r\n") || strings.ContainsAny(from, "\r\n") {
		return nil, errors.New("invalid resend configuration")
	}
	if _, err := mail.ParseAddress(from); err != nil {
		return nil, errors.New("invalid resend configuration")
	}
	safeClient := *client
	safeClient.CheckRedirect = func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }
	return &ResendSender{apiKey: apiKey, from: from, client: safeClient}, nil
}

func providerUUID(value string) bool {
	return regexp.MustCompile(`^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$`).MatchString(value)
}

func (r *ResendSender) Send(ctx context.Context, email domain.Email) (domain.SendResult, error) {
	if ctx.Err() != nil {
		return domain.SendResult{}, ErrResendUnavailable
	}
	if !providerUUID(email.MessageID) || !domain.ValidEmail(email.Recipient) || strings.TrimSpace(email.Subject) == "" || strings.ContainsAny(email.Subject, "\r\n") || email.HTML == "" || email.Text == "" {
		return domain.SendResult{}, errors.New("invalid resend email")
	}
	payload := struct {
		From    string   `json:"from"`
		To      []string `json:"to"`
		Subject string   `json:"subject"`
		HTML    string   `json:"html"`
		Text    string   `json:"text"`
	}{From: r.from, To: []string{email.Recipient}, Subject: email.Subject, HTML: email.HTML, Text: email.Text}
	body, err := json.Marshal(payload)
	if err != nil {
		return domain.SendResult{}, errors.New("invalid resend email")
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, "https://api.resend.com/emails", bytes.NewReader(body))
	if err != nil {
		return domain.SendResult{}, ErrResendUnavailable
	}
	req.Header.Set("Authorization", "Bearer "+r.apiKey)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Idempotency-Key", email.MessageID)
	response, err := r.client.Do(req)
	if err != nil {
		return domain.SendResult{}, ErrResendUnavailable
	}
	defer func() { _ = response.Body.Close() }()
	if response.StatusCode == http.StatusTooManyRequests || response.StatusCode >= http.StatusInternalServerError {
		return domain.SendResult{}, ErrResendUnavailable
	}
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return domain.SendResult{}, ErrResendRejected
	}
	// Only a small acceptance document is expected, not a retained provider body.
	const maxResponse = 4096
	raw, err := io.ReadAll(io.LimitReader(response.Body, maxResponse+1))
	if err != nil || len(raw) > maxResponse {
		return domain.SendResult{}, ErrResendResponse
	}
	var accepted struct {
		ID string `json:"id"`
	}
	if json.Unmarshal(raw, &accepted) != nil || !providerUUID(accepted.ID) {
		return domain.SendResult{}, ErrResendResponse
	}
	return domain.SendResult{Provider: "resend", MessageID: accepted.ID}, nil
}
