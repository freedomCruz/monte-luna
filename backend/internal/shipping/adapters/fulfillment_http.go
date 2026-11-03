// Package adapters implements the shipping admin HTTP contract.
package adapters

import (
	"encoding/json"
	"errors"
	"io"
	"mime"
	"net/http"
	"regexp"
	"strconv"
	"strings"

	"github.com/freedomCruz/monte-luna/backend/internal/identity"
	"github.com/freedomCruz/monte-luna/backend/internal/shipping/app"
	"github.com/freedomCruz/monte-luna/backend/internal/shipping/domain"
)

type FulfillmentHTTP struct {
	service *app.Dispatch
	access  identity.AccessChecker
}

func NewFulfillmentHTTP(service *app.Dispatch, access identity.AccessChecker) (*FulfillmentHTTP, error) {
	if service == nil || access == nil {
		return nil, errors.New("admin dispatch dependencies are required")
	}
	return &FulfillmentHTTP{service: service, access: access}, nil
}
func (h *FulfillmentHTTP) RegisterRoutes(mux *http.ServeMux, sessions func(http.Handler) http.Handler) {
	origin := http.NewCrossOriginProtection()
	origin.SetDenyHandler(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { dispatchProblem(w, 403, "cross_origin_rejected", "") }))
	const path = "/api/v1/admin/orders/{id}/dispatch"
	mux.Handle("POST "+path, dispatchNoStore(origin.Handler(sessions(http.HandlerFunc(h.dispatch)))))
	mux.Handle(path, dispatchNoStore(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Allow", "POST")
		http.Error(w, "Method Not Allowed", http.StatusMethodNotAllowed)
	})))
}
func (h *FulfillmentHTTP) dispatch(w http.ResponseWriter, r *http.Request) {
	actor, err := h.access.Require(r.Context(), "orders")
	if err != nil {
		switch {
		case errors.Is(err, identity.ErrAuthenticationRequired):
			dispatchProblem(w, 401, "authentication_required", "")
		case errors.Is(err, identity.ErrForbidden):
			dispatchProblem(w, 403, "forbidden", "")
		default:
			dispatchProblem(w, 500, "internal_error", "")
		}
		return
	}
	if actor.Role != "owner" && actor.Role != "staff" {
		dispatchProblem(w, 403, "forbidden", "")
		return
	}
	id := r.PathValue("id")
	if !domain.ValidID(id) {
		dispatchProblem(w, 400, "bad_request", "")
		return
	}
	matches := r.Header.Values("If-Match")
	if len(matches) == 0 {
		dispatchProblem(w, 412, "version_conflict", "")
		return
	}
	if len(matches) != 1 || !regexp.MustCompile(`^"[1-9][0-9]*"$`).MatchString(matches[0]) {
		dispatchProblem(w, 400, "bad_request", "")
		return
	}
	version, err := strconv.ParseInt(strings.Trim(matches[0], `"`), 10, 32)
	if err != nil {
		dispatchProblem(w, 400, "bad_request", "")
		return
	}
	in, ok := dispatchBody(w, r)
	if !ok {
		return
	}
	in.OrderID = id
	in.ActorID = actor.ID
	in.OrderVersion = int32(version)
	s, err := h.service.Dispatch(r.Context(), in)
	if err != nil {
		var invalid *domain.ValidationError
		switch {
		case errors.As(err, &invalid):
			dispatchProblem(w, 422, "validation_failed", invalid.Field)
		case errors.Is(err, domain.ErrVersionConflict):
			dispatchProblem(w, 412, "version_conflict", "")
		case errors.Is(err, domain.ErrOrderNotFound):
			dispatchProblem(w, 404, "order_not_found", "")
		case errors.Is(err, domain.ErrInvalidTransition):
			dispatchProblem(w, 409, "invalid_order_transition", "")
		default:
			dispatchProblem(w, 500, "internal_error", "")
		}
		return
	}
	body, err := json.Marshal(s)
	if err != nil {
		dispatchProblem(w, 500, "internal_error", "")
		return
	}
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("ETag", `"`+strconv.FormatInt(int64(s.Version), 10)+`"`)
	w.WriteHeader(200)
	_, _ = w.Write(body)
}
func dispatchBody(w http.ResponseWriter, r *http.Request) (domain.DispatchInput, bool) {
	var in domain.DispatchInput
	if media, _, err := mime.ParseMediaType(r.Header.Get("Content-Type")); err != nil || media != "application/json" {
		dispatchProblem(w, 400, "bad_request", "")
		return in, false
	}
	data, err := io.ReadAll(http.MaxBytesReader(w, r.Body, 16<<10))
	if err != nil || !json.Valid(data) {
		dispatchProblem(w, 400, "bad_request", "")
		return in, false
	}
	var fields map[string]json.RawMessage
	if json.Unmarshal(data, &fields) != nil || fields == nil {
		dispatchProblem(w, 422, "validation_failed", "")
		return in, false
	}
	// Stable checks do not echo arbitrary input keys or values in problems.
	for key := range fields {
		if key != "carrier_name" && key != "shipment_version" && key != "tracking_number" && key != "tracking_url" {
			dispatchProblem(w, 422, "validation_failed", "")
			return in, false
		}
	}
	var carrier *string
	if raw, ok := fields["carrier_name"]; !ok || json.Unmarshal(raw, &carrier) != nil || carrier == nil {
		dispatchProblem(w, 422, "validation_failed", "carrier_name")
		return in, false
	}
	in.CarrierName = *carrier
	if raw, ok := fields["shipment_version"]; !ok || json.Unmarshal(raw, &in.ShipmentVersion) != nil {
		dispatchProblem(w, 422, "validation_failed", "shipment_version")
		return in, false
	}
	if raw, ok := fields["tracking_number"]; ok && json.Unmarshal(raw, &in.TrackingNumber) != nil {
		dispatchProblem(w, 422, "validation_failed", "tracking_number")
		return in, false
	}
	if raw, ok := fields["tracking_url"]; ok && json.Unmarshal(raw, &in.TrackingURL) != nil {
		dispatchProblem(w, 422, "validation_failed", "tracking_url")
		return in, false
	}
	return in, true
}
func dispatchProblem(w http.ResponseWriter, status int, code, field string) {
	type fieldError struct {
		Field   string `json:"field"`
		Code    string `json:"code"`
		Message string `json:"message"`
	}
	body := struct {
		Type   string       `json:"type"`
		Title  string       `json:"title"`
		Status int          `json:"status"`
		Code   string       `json:"code"`
		Detail string       `json:"detail"`
		Errors []fieldError `json:"errors,omitempty"`
	}{Type: "https://monteluna.example/problems/" + strings.ReplaceAll(code, "_", "-"), Title: http.StatusText(status), Status: status, Code: code, Detail: "The request could not be completed; reload the order or sign in again."}
	if field != "" {
		body.Errors = []fieldError{{Field: field, Code: "invalid", Message: "This field is required or invalid."}}
	}
	data, _ := json.Marshal(body)
	w.Header().Set("Content-Type", "application/problem+json")
	w.WriteHeader(status)
	_, _ = w.Write(data)
}

// SCS may append cookie cache directives during response writing; pin exactly
// no-store after the session middleware has finished its header mutations.
type dispatchWriter struct {
	http.ResponseWriter
	written bool
}

func (w *dispatchWriter) WriteHeader(status int) {
	if w.written {
		return
	}
	w.written = true
	w.Header().Set("Cache-Control", "no-store")
	w.ResponseWriter.WriteHeader(status)
}
func (w *dispatchWriter) Write(p []byte) (int, error) {
	if !w.written {
		w.WriteHeader(200)
	}
	return w.ResponseWriter.Write(p)
}
func (w *dispatchWriter) Unwrap() http.ResponseWriter { return w.ResponseWriter }
func dispatchNoStore(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		next.ServeHTTP(&dispatchWriter{ResponseWriter: w}, r)
	})
}
