package adapters

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/freedomCruz/monte-luna/backend/internal/notifications/domain"
)

type resendWebhook struct {
	store domain.WebhookRepository
	key   []byte
	now   func() time.Time
}

// NewResendWebhook exposes only the approved provider route. The caller supplies
// its validated signing secret and clock; no environment or admin session is read.
func NewResendWebhook(store domain.WebhookRepository, secret string, now func() time.Time) (http.Handler, error) {
	key, err := base64.StdEncoding.DecodeString(strings.TrimPrefix(secret, "whsec_"))
	if err != nil || len(key) == 0 || store == nil || now == nil {
		return nil, errors.New("invalid notification webhook configuration")
	}
	handler := &resendWebhook{store: store, key: key, now: now}
	mux := http.NewServeMux()
	mux.HandleFunc("POST /api/v1/notifications/webhooks/resend", handler.receive)
	return mux, nil
}

func (h *resendWebhook) receive(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	id, timestamp, signature := r.Header.Get("svix-id"), r.Header.Get("svix-timestamp"), r.Header.Get("svix-signature")
	received := h.now().UTC()
	if len(r.Header.Values("svix-id")) != 1 || len(r.Header.Values("svix-timestamp")) != 1 || len(r.Header.Values("svix-signature")) != 1 || id == "" || signature == "" || !decimalTimestamp(timestamp) {
		webhookProblem(w, 401, "invalid_webhook_signature")
		return
	}
	seconds, err := strconv.ParseInt(timestamp, 10, 64)
	if err != nil || seconds < received.Unix()-300 || seconds > received.Unix()+300 {
		webhookProblem(w, 401, "invalid_webhook_signature")
		return
	}
	const maxBody = 1 << 20
	body, err := io.ReadAll(io.LimitReader(r.Body, maxBody+1))
	if err != nil || len(body) > maxBody {
		webhookProblem(w, 400, "invalid_json")
		return
	}
	mac := hmac.New(sha256.New, h.key)
	_, _ = mac.Write([]byte(id + "." + timestamp + "."))
	_, _ = mac.Write(body)
	expected := mac.Sum(nil)
	valid := false
	for _, candidate := range strings.Fields(signature) {
		version, value, ok := strings.Cut(candidate, ",")
		if !ok || version != "v1" {
			continue
		}
		decoded, err := base64.StdEncoding.DecodeString(value)
		if err == nil && hmac.Equal(expected, decoded) {
			valid = true
		}
	}
	if !valid {
		webhookProblem(w, 401, "invalid_webhook_signature")
		return
	}
	if !json.Valid(body) {
		webhookProblem(w, 400, "invalid_json")
		return
	}
	var envelope struct {
		Type      string          `json:"type"`
		CreatedAt string          `json:"created_at"`
		Data      json.RawMessage `json:"data"`
	}
	if json.Unmarshal(body, &envelope) != nil || envelope.Type == "" {
		webhookProblem(w, 422, "validation_failed")
		return
	}
	if _, err := time.Parse(time.RFC3339Nano, envelope.CreatedAt); err != nil {
		webhookProblem(w, 422, "validation_failed")
		return
	}
	var object map[string]json.RawMessage
	if json.Unmarshal(envelope.Data, &object) != nil || object == nil {
		webhookProblem(w, 422, "validation_failed")
		return
	}
	switch envelope.Type {
	case "email.delivered", "email.bounced", "email.complained":
	default:
		w.WriteHeader(http.StatusOK)
		return
	}
	// Provider extras are intentionally allowed. Only declared consumed fields are
	// decoded, and provider diagnostics never reach persistence or problem details.
	var data struct {
		EmailID     string            `json:"email_id"`
		To          []string          `json:"to"`
		CreatedAt   *string           `json:"created_at"`
		From        string            `json:"from"`
		Subject     string            `json:"subject"`
		MessageID   string            `json:"message_id"`
		BroadcastID string            `json:"broadcast_id"`
		TemplateID  string            `json:"template_id"`
		Tags        map[string]string `json:"tags"`
	}
	if json.Unmarshal(envelope.Data, &data) != nil || !webhookStringFields(object, "email_id", "created_at", "from", "subject", "message_id", "broadcast_id", "template_id") {
		webhookProblem(w, 422, "validation_failed")
		return
	}
	if raw, present := object["tags"]; present {
		var tags map[string]json.RawMessage
		if json.Unmarshal(raw, &tags) != nil || tags == nil {
			webhookProblem(w, 422, "validation_failed")
			return
		}
		for name := range tags {
			if !webhookStringFields(tags, name) {
				webhookProblem(w, 422, "validation_failed")
				return
			}
		}
	}
	if data.CreatedAt != nil {
		if _, err := time.Parse(time.RFC3339Nano, *data.CreatedAt); err != nil {
			webhookProblem(w, 422, "validation_failed")
			return
		}
	}
	event := domain.ProviderEvent{ExternalID: id, Type: envelope.Type, ProviderMessageID: data.EmailID, Recipients: data.To}
	if event.Type == "email.bounced" {
		var bounce struct {
			Type           string   `json:"type"`
			SubType        string   `json:"subType"`
			Message        string   `json:"message"`
			DiagnosticCode []string `json:"diagnosticCode"`
		}
		var fields map[string]json.RawMessage
		if json.Unmarshal(object["bounce"], &bounce) != nil || bounce.Type == "" || json.Unmarshal(object["bounce"], &fields) != nil || !webhookStringFields(fields, "type", "subType", "message") {
			webhookProblem(w, 422, "validation_failed")
			return
		}
		if raw, present := fields["diagnosticCode"]; present {
			var diagnostics []*string
			if json.Unmarshal(raw, &diagnostics) != nil || diagnostics == nil {
				webhookProblem(w, 422, "validation_failed")
				return
			}
			for _, diagnostic := range diagnostics {
				if diagnostic == nil {
					webhookProblem(w, 422, "validation_failed")
					return
				}
			}
		}
		event.BounceType = bounce.Type
	}
	if event.Validate() != nil {
		webhookProblem(w, 422, "validation_failed")
		return
	}
	if err := h.store.ProcessWebhook(r.Context(), event, received); err != nil {
		if errors.Is(err, domain.ErrMessageNotFound) {
			webhookProblem(w, 503, "notification_message_not_found")
		} else {
			webhookProblem(w, 503, "dependency_unavailable")
		}
		return
	}
	w.WriteHeader(http.StatusOK)
}

// encoding/json otherwise silently accepts null into string destinations. The
// provider contract permits extra fields, but declared strings are not nullable.
func webhookStringFields(object map[string]json.RawMessage, names ...string) bool {
	for _, name := range names {
		if raw, present := object[name]; present {
			var value *string
			if json.Unmarshal(raw, &value) != nil || value == nil {
				return false
			}
		}
	}
	return true
}

func decimalTimestamp(value string) bool {
	if value == "" {
		return false
	}
	for _, char := range value {
		if char < '0' || char > '9' {
			return false
		}
	}
	return true
}
func webhookProblem(w http.ResponseWriter, status int, code string) {
	w.Header().Set("Content-Type", "application/problem+json")
	w.WriteHeader(status)
	// No raw request, signature, key, provider diagnostic or database error is echoed.
	_ = json.NewEncoder(w).Encode(struct {
		Type   string `json:"type"`
		Title  string `json:"title"`
		Status int    `json:"status"`
		Code   string `json:"code"`
	}{Type: "https://monteluna.example/problems/" + strings.ReplaceAll(code, "_", "-"), Title: http.StatusText(status), Status: status, Code: code})
}
