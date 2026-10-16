package adapters

import (
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"regexp"
	"strings"

	"github.com/freedomCruz/monte-luna/backend/internal/payments/app"
	"github.com/freedomCruz/monte-luna/backend/internal/payments/domain"
)

type HTTP struct {
	start          *app.Start
	logger         *slog.Logger
	reconciliation *app.Reconciliation
	eventsSecret   string
}

func NewHTTP(start *app.Start, logger *slog.Logger) *HTTP { return &HTTP{start: start, logger: logger} }
func (h *HTTP) RegisterRoutes(mux *http.ServeMux) {
	mux.HandleFunc("POST /api/v1/payments", h.startPayment)
	if h.reconciliation != nil {
		mux.HandleFunc("POST /api/v1/payments/verify", h.verifyPayment)
		mux.HandleFunc("POST /api/v1/payments/webhooks/wompi", h.webhook)
	}
}
func (h *HTTP) EnableReconciliation(service *app.Reconciliation, eventsSecret string) {
	h.reconciliation = service
	h.eventsSecret = eventsSecret
}
func (h *HTTP) verifyPayment(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	var body struct {
		Token         string          `json:"tracking_token"`
		TransactionID json.RawMessage `json:"transaction_id"`
	}
	if err := readBody(w, r, &body); err != nil {
		h.problem(w, err)
		return
	}
	if !validToken(body.Token) || len(body.TransactionID) == 0 {
		h.problem(w, domain.Problem(422, "validation_failed"))
		return
	}
	var id *string
	if err := json.Unmarshal(body.TransactionID, &id); err != nil || (id != nil && *id == "") {
		h.problem(w, domain.Problem(422, "validation_failed"))
		return
	}
	hint := ""
	if id != nil {
		hint = *id
	}
	payment, err := h.reconciliation.Verify(r.Context(), body.Token, hint)
	if err != nil {
		h.problem(w, err)
		return
	}
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	_ = json.NewEncoder(w).Encode(struct {
		Payment *domain.GuestPayment `json:"payment"`
	}{payment})
}
func (h *HTTP) webhook(w http.ResponseWriter, r *http.Request) {
	body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, 1<<20))
	if err != nil {
		h.problem(w, domain.Problem(400, "bad_request"))
		return
	}
	if err := h.reconciliation.Webhook(r.Context(), body, r.Header.Get("X-Event-Checksum"), h.eventsSecret); err != nil {
		h.problem(w, err)
		return
	}
	w.WriteHeader(http.StatusOK)
}
func validToken(token string) bool {
	return regexp.MustCompile(`^[A-Za-z0-9_-]{43}$`).MatchString(token)
}
func uuidKey(value string) (string, bool) {
	value = strings.ToLower(value)
	return value, regexp.MustCompile(`^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`).MatchString(value)
}
func readBody(w http.ResponseWriter, r *http.Request, target any) error {
	decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<20))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(target); err != nil {
		var syntax *json.SyntaxError
		if errors.As(err, &syntax) || errors.Is(err, io.EOF) || errors.Is(err, io.ErrUnexpectedEOF) {
			return domain.Problem(400, "bad_request")
		}
		return domain.Problem(422, "validation_failed")
	}
	var extra any
	if err := decoder.Decode(&extra); !errors.Is(err, io.EOF) {
		return domain.Problem(400, "bad_request")
	}
	return nil
}
func (h *HTTP) startPayment(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	var body struct {
		Token string `json:"tracking_token"`
	}
	if err := readBody(w, r, &body); err != nil {
		h.problem(w, err)
		return
	}
	key, valid := uuidKey(r.Header.Get("Idempotency-Key"))
	if !valid || !validToken(body.Token) {
		h.problem(w, domain.Problem(422, "validation_failed"))
		return
	}
	checkout, err := h.start.Start(r.Context(), key, body.Token)
	if err != nil {
		h.problem(w, err)
		return
	}
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Location", "/api/v1/payments/verify")
	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(checkout)
}
func (h *HTTP) problem(w http.ResponseWriter, err error) {
	problem := &domain.Error{Status: 500, Code: "internal_error"}
	var known *domain.Error
	if errors.As(err, &known) {
		problem = known
	} else {
		h.logger.Error("payment request failed")
	}
	w.Header().Set("Content-Type", "application/problem+json")
	w.WriteHeader(problem.Status)
	_ = json.NewEncoder(w).Encode(struct {
		Type   string `json:"type"`
		Title  string `json:"title"`
		Status int    `json:"status"`
		Code   string `json:"code"`
		Detail string `json:"detail"`
	}{"https://monteluna.example/problems/" + strings.ReplaceAll(problem.Code, "_", "-"), http.StatusText(problem.Status), problem.Status, problem.Code, "The payment request could not be completed."})
}
