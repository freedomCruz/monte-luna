package adapters

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mime"
	"net/http"
	"net/url"
	"regexp"
	"slices"
	"strings"

	"github.com/freedomCruz/monte-luna/backend/internal/orders/domain"
)

func strictFields(raw json.RawMessage, allowed, nullable []string, prefix string) (map[string]json.RawMessage, error) {
	var fields map[string]json.RawMessage
	if err := json.Unmarshal(raw, &fields); err != nil || fields == nil {
		return nil, domain.Validation(strings.TrimSuffix(prefix, "."), "invalid_format")
	}
	if err := unknown(fields, allowed, prefix); err != nil {
		return nil, err
	}
	for _, field := range allowed {
		value, present := fields[field]
		if !present || (string(value) == "null" && !slices.Contains(nullable, field)) {
			return nil, domain.Validation(prefix+field, "required")
		}
	}
	return fields, nil
}
func parsePlacement(w http.ResponseWriter, r *http.Request) (domain.PlaceRequest, error) {
	var request domain.PlaceRequest
	media, _, err := mime.ParseMediaType(r.Header.Get("Content-Type"))
	if err != nil || media != "application/json" {
		return request, &domain.Error{Status: 400, Code: "malformed_request"}
	}
	decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<20))
	var raw json.RawMessage
	if err := decoder.Decode(&raw); err != nil {
		return request, &domain.Error{Status: 400, Code: "malformed_request"}
	}
	if err := decoder.Decode(new(any)); err != io.EOF {
		return request, &domain.Error{Status: 400, Code: "malformed_request"}
	}
	root, err := strictFields(raw, []string{"items", "customer", "shipping_address", "fiscal_data", "accepts_data_policy"}, []string{"fiscal_data"}, "")
	if err != nil {
		return request, err
	}
	if _, err := strictFields(root["customer"], []string{"email", "full_name", "phone"}, []string{"phone"}, "customer."); err != nil {
		return request, err
	}
	if _, err := strictFields(root["shipping_address"], []string{"recipient_name", "recipient_phone", "municipality_code", "address_line1", "address_line2", "postal_code", "delivery_notes"}, []string{"address_line2", "postal_code", "delivery_notes"}, "shipping_address."); err != nil {
		return request, err
	}
	if string(root["fiscal_data"]) != "null" {
		if _, err := strictFields(root["fiscal_data"], []string{"person_type", "document_type", "document_number"}, nil, "fiscal_data."); err != nil {
			return request, err
		}
	}
	var items []json.RawMessage
	if err := json.Unmarshal(root["items"], &items); err != nil {
		return request, domain.Validation("items", "invalid_format")
	}
	for i, item := range items {
		fields, err := strictFields(item, []string{"variant_id", "quantity"}, nil, fmt.Sprintf("items[%d].", i))
		if err != nil {
			return request, err
		}
		var id string
		var quantity int32
		if err := json.Unmarshal(fields["variant_id"], &id); err != nil {
			return request, domain.Validation(fmt.Sprintf("items[%d].variant_id", i), "invalid_format")
		}
		if err := json.Unmarshal(fields["quantity"], &quantity); err != nil {
			return request, domain.Validation(fmt.Sprintf("items[%d].quantity", i), "invalid_format")
		}
	}
	if err := json.Unmarshal(raw, &request); err != nil {
		var wrongType *json.UnmarshalTypeError
		if errors.As(err, &wrongType) {
			return request, domain.Validation(wrongType.Field, "invalid_format")
		}
		return request, &domain.Error{Status: 400, Code: "malformed_request"}
	}
	return request, nil
}
func (h *HTTP) place(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	if len(r.Header.Values("Idempotency-Key")) != 1 {
		h.problem(w, domain.Validation("Idempotency-Key", "required"))
		return
	}
	request, err := parsePlacement(w, r)
	if err != nil {
		h.problem(w, err)
		return
	}
	result, err := h.placement.Place(r.Context(), r.Header.Get("Idempotency-Key"), request)
	if err != nil {
		var known *domain.Error
		if !errors.As(err, &known) {
			h.logger.ErrorContext(r.Context(), "order placement failed", "error", err)
		}
		h.problem(w, err)
		return
	}
	body, err := json.Marshal(result)
	if err != nil {
		h.problem(w, err)
		return
	}
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Location", "/api/v1/orders/track?token="+url.QueryEscape(result.TrackingToken))
	w.WriteHeader(201)
	if _, err := w.Write(body); err != nil {
		h.logger.ErrorContext(r.Context(), "placement response write failed", "error", err)
	}
}
func (h *HTTP) track(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	query, err := url.ParseQuery(r.URL.RawQuery)
	if err != nil || len(query) != 1 || len(query["token"]) != 1 || !regexp.MustCompile(`^[A-Za-z0-9_-]{43}$`).MatchString(query.Get("token")) {
		h.problem(w, &domain.Error{Status: 400, Code: "malformed_request"})
		return
	}
	result, err := h.guest.Track(r.Context(), domain.TokenHash(query.Get("token")))
	if err != nil {
		var known *domain.Error
		if !errors.As(err, &known) {
			h.logger.ErrorContext(r.Context(), "guest tracking failed", "error", err)
		}
		h.problem(w, err)
		return
	}
	body, err := json.Marshal(result)
	if err != nil {
		h.problem(w, err)
		return
	}
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(200)
	if _, err := w.Write(body); err != nil {
		h.logger.ErrorContext(r.Context(), "guest response write failed", "error", err)
	}
}
