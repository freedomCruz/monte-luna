package adapters

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"mime"
	"net/http"
	"slices"
	"strings"

	"github.com/freedomCruz/monte-luna/backend/internal/orders/app"
	"github.com/freedomCruz/monte-luna/backend/internal/orders/domain"
)

type HTTP struct {
	service   *app.Service
	placement *app.Placement
	guest     domain.GuestReader
	logger    *slog.Logger
}

func NewHTTP(service *app.Service, logger *slog.Logger) *HTTP {
	if logger == nil {
		logger = slog.Default()
	}
	return &HTTP{service: service, logger: logger}
}
func (h *HTTP) RegisterRoutes(mux *http.ServeMux) {
	mux.HandleFunc("POST /api/v1/orders/quote", h.quote)
	if h.placement != nil {
		mux.Handle("POST /api/v1/orders", http.NewCrossOriginProtection().Handler(http.HandlerFunc(h.place)))
		mux.HandleFunc("GET /api/v1/orders/track", h.track)
	}
}
func (h *HTTP) EnablePlacement(placement *app.Placement, guest domain.GuestReader) {
	h.placement = placement
	h.guest = guest
}
func unknown(raw map[string]json.RawMessage, allowed []string, prefix string) error {
	keys := make([]string, 0, len(raw))
	for key := range raw {
		keys = append(keys, key)
	}
	slices.Sort(keys)
	for _, key := range keys {
		if !slices.Contains(allowed, key) {
			return domain.Validation(prefix+key, "unknown_field")
		}
	}
	return nil
}
func parseQuote(w http.ResponseWriter, r *http.Request) (domain.QuoteRequest, error) {
	var request domain.QuoteRequest
	media, _, err := mime.ParseMediaType(r.Header.Get("Content-Type"))
	if err != nil || media != "application/json" {
		return request, &domain.Error{Status: 400, Code: "malformed_request"}
	}
	r.Body = http.MaxBytesReader(w, r.Body, 1<<20)
	decoder := json.NewDecoder(r.Body)
	var raw map[string]json.RawMessage
	if err := decoder.Decode(&raw); err != nil {
		return request, &domain.Error{Status: 400, Code: "malformed_request"}
	}
	if err := decoder.Decode(new(any)); err != io.EOF {
		return request, &domain.Error{Status: 400, Code: "malformed_request"}
	}
	if err := unknown(raw, []string{"items", "municipality_code"}, ""); err != nil {
		return request, err
	}
	if err := json.Unmarshal(raw["municipality_code"], &request.MunicipalityCode); err != nil {
		return request, domain.Validation("municipality_code", "invalid_format")
	}
	var items []json.RawMessage
	if err := json.Unmarshal(raw["items"], &items); err != nil {
		return request, domain.Validation("items", "invalid_format")
	}
	for i, item := range items {
		prefix := fmt.Sprintf("items[%d].", i)
		var fields map[string]json.RawMessage
		if err := json.Unmarshal(item, &fields); err != nil || fields == nil {
			return request, domain.Validation(fmt.Sprintf("items[%d]", i), "invalid_format")
		}
		if err := unknown(fields, []string{"variant_id", "quantity"}, prefix); err != nil {
			return request, err
		}
		var decoded domain.Item
		if err := json.Unmarshal(fields["variant_id"], &decoded.VariantID); err != nil {
			return request, domain.Validation(prefix+"variant_id", "invalid_format")
		}
		if err := json.Unmarshal(fields["quantity"], &decoded.Quantity); err != nil {
			return request, domain.Validation(prefix+"quantity", "invalid_format")
		}
		request.Items = append(request.Items, decoded)
	}
	return request, nil
}
func (h *HTTP) quote(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	request, err := parseQuote(w, r)
	if err != nil {
		h.problem(w, err)
		return
	}
	quote, err := h.service.Quote(r.Context(), request)
	if err != nil {
		var known *domain.Error
		if !errors.As(err, &known) {
			h.logger.ErrorContext(r.Context(), "checkout quote failed", "error", err)
		}
		h.problem(w, err)
		return
	}
	body, err := json.Marshal(quote)
	if err != nil {
		h.problem(w, err)
		return
	}
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(200)
	if _, err := w.Write(body); err != nil {
		h.logger.ErrorContext(r.Context(), "quote response write failed", "error", err)
	}
}
func (h *HTTP) problem(w http.ResponseWriter, err error) {
	problem := &domain.Error{Status: 500, Code: "internal_error"}
	var known *domain.Error
	if errors.As(err, &known) {
		problem = known
	}
	title, detail := "Unexpected server error", "The quote could not be calculated."
	switch problem.Status {
	case 400:
		title, detail = "Malformed request", "The request body is invalid."
	case 409:
		title, detail = "Insufficient stock", "The requested quantity is not available."
	case 422:
		title, detail = "Validation failed", "One or more fields are invalid."
	}
	body := struct {
		Type   string              `json:"type"`
		Title  string              `json:"title"`
		Status int                 `json:"status"`
		Code   string              `json:"code"`
		Detail string              `json:"detail"`
		Errors []domain.FieldError `json:"errors,omitempty"`
	}{Type: "https://monteluna.example/problems/" + strings.ReplaceAll(problem.Code, "_", "-"), Title: title, Status: problem.Status, Code: problem.Code, Detail: detail, Errors: problem.Fields}
	encoded, encodeErr := json.Marshal(body)
	if encodeErr != nil {
		h.logger.Error("problem encoding failed", "error", encodeErr)
		w.WriteHeader(500)
		return
	}
	w.Header().Set("Content-Type", "application/problem+json")
	w.WriteHeader(problem.Status)
	if _, err := w.Write(encoded); err != nil {
		h.logger.Error("problem write failed", "error", err)
	}
}
