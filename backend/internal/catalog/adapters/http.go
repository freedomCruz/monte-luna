package adapters

import (
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"net/url"
	"slices"
	"strconv"
	"strings"

	"github.com/freedomCruz/monte-luna/backend/internal/catalog/app"
	"github.com/freedomCruz/monte-luna/backend/internal/catalog/domain"
)

type HTTP struct {
	service *app.Service
	logger  *slog.Logger
}

func NewHTTP(service *app.Service, logger *slog.Logger) *HTTP {
	return &HTTP{service: service, logger: logger}
}
func (h *HTTP) RegisterRoutes(mux *http.ServeMux) {
	for _, route := range []struct {
		path string
		kind domain.Kind
	}{
		{"/api/v1/products", domain.Products}, {"/api/v1/products/{slug}", domain.ProductDetail},
		{"/api/v1/categories", domain.Categories}, {"/api/v1/origins", domain.Origins},
		{"/api/v1/origins/{slug}", domain.OriginDetail}, {"/api/v1/origins/{slug}/products", domain.OriginProducts},
		{"/api/v1/product-availabilities", domain.Availabilities},
	} {
		mux.HandleFunc("GET "+route.path, func(w http.ResponseWriter, r *http.Request) { h.read(w, r, route.kind) })
	}
}
func queryError(field, code string) *domain.Error {
	return &domain.Error{Status: 422, Code: "validation_failed", Fields: []domain.FieldError{{Field: field, Code: code, Message: "Invalid query parameter."}}}
}
func parseRequest(r *http.Request, kind domain.Kind) (domain.Request, error) {
	request := domain.Request{Kind: kind, Slug: r.PathValue("slug"), Limit: 24}
	values, err := url.ParseQuery(r.URL.RawQuery)
	if err != nil {
		return request, &domain.Error{Status: 400, Code: "malformed_request"}
	}
	allowed := map[string]bool{}
	if kind != domain.ProductDetail && kind != domain.OriginDetail {
		allowed["limit"] = true
		allowed["cursor"] = true
		if kind != domain.Availabilities {
			allowed["sort"] = true
		}
	}
	if kind == domain.Products {
		allowed["category"] = true
		allowed["product_type"] = true
	}
	if kind == domain.Availabilities {
		allowed["product_slug"] = true
	}
	keys := make([]string, 0, len(values))
	for key := range values {
		keys = append(keys, key)
	}
	slices.Sort(keys)
	for _, key := range keys {
		if !allowed[key] {
			return request, queryError(key, "unknown_parameter")
		}
	}
	for _, key := range []string{"limit", "cursor", "sort"} {
		if value, exists := values[key]; exists {
			if len(value) != 1 || value[0] == "" {
				return request, queryError(key, "invalid_parameter")
			}
			switch key {
			case "limit":
				request.Limit, err = strconv.Atoi(value[0])
				if err != nil {
					return request, queryError(key, "invalid_parameter")
				}
			case "cursor":
				request.Cursor = value[0]
			case "sort":
				request.Sort = value[0]
			}
		}
	}
	request.Categories = values["category"]
	request.ProductTypes = values["product_type"]
	request.ProductSlugs = values["product_slug"]
	return request, nil
}
func (h *HTTP) read(w http.ResponseWriter, r *http.Request, kind domain.Kind) {
	cache := "public, max-age=60"
	if kind == domain.Availabilities {
		cache = "no-store"
	}
	w.Header().Set("Cache-Control", cache)
	request, err := parseRequest(r, kind)
	if err != nil {
		h.problem(w, err)
		return
	}
	value, err := h.service.Read(r.Context(), request)
	if err != nil {
		h.logger.ErrorContext(r.Context(), "catalog read failed", "error", err)
		h.problem(w, err)
		return
	}
	body, err := json.Marshal(value)
	if err != nil {
		h.logger.ErrorContext(r.Context(), "catalog response encoding failed", "error", err)
		h.problem(w, err)
		return
	}
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(http.StatusOK)
	if _, err := w.Write(body); err != nil {
		h.logger.ErrorContext(r.Context(), "catalog response write failed", "error", err)
	}
}
func (h *HTTP) problem(w http.ResponseWriter, err error) {
	problem := &domain.Error{Status: 500, Code: "internal_error"}
	var known *domain.Error
	if errors.As(err, &known) {
		problem = known
	}
	title, detail := "Unexpected server error", "The catalog could not be read."
	switch problem.Status {
	case 400:
		title = "Malformed request"
		detail = "The request or cursor is invalid."
	case 404:
		title = "Resource not found"
		detail = "The requested resource was not found."
	case 422:
		title = "Validation failed"
		detail = "One or more parameters are invalid."
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
		return
	}
	w.Header().Set("Content-Type", "application/problem+json")
	w.WriteHeader(problem.Status)
	if _, err := w.Write(encoded); err != nil {
		h.logger.Error("problem write failed", "error", err)
	}
}
