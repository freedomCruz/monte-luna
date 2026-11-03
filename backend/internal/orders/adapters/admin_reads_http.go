package adapters

import (
	"encoding/json"
	"errors"
	"net/http"
	"net/url"
	"strconv"
	"strings"

	"github.com/freedomCruz/monte-luna/backend/internal/identity"
	"github.com/freedomCruz/monte-luna/backend/internal/orders/app"
	"github.com/freedomCruz/monte-luna/backend/internal/orders/domain"
)

type AdminReadHTTP struct {
	service *app.AdminReads
	access  identity.AccessChecker
}

func NewAdminReadHTTP(service *app.AdminReads, access identity.AccessChecker) (*AdminReadHTTP, error) {
	if service == nil || access == nil {
		return nil, errors.New("orders admin HTTP dependencies required")
	}
	return &AdminReadHTTP{service, access}, nil
}
func (h *AdminReadHTTP) RegisterRoutes(mux *http.ServeMux, sessions func(http.Handler) http.Handler) {
	for _, path := range []string{"/api/v1/admin/orders", "/api/v1/admin/orders/metrics", "/api/v1/admin/orders/{id}"} {
		mux.Handle("GET "+path, adminReadNoStore(sessions(http.HandlerFunc(h.read))))
		// The {id} method fallback also covers /metrics. A separate methodless
		// /metrics pattern would conflict with GET /{id} in net/http's mux.
		if path != "/api/v1/admin/orders/metrics" {
			mux.Handle(path, adminReadNoStore(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
				w.Header().Set("Allow", "GET, HEAD")
				http.Error(w, http.StatusText(http.StatusMethodNotAllowed), http.StatusMethodNotAllowed)
			})))
		}
	}
}
func (h *AdminReadHTTP) read(w http.ResponseWriter, r *http.Request) {
	actor, err := h.access.Require(r.Context(), "orders")
	if err != nil {
		switch {
		case errors.Is(err, identity.ErrAuthenticationRequired):
			adminReadProblem(w, &domain.Error{Status: 401, Code: "authentication_required"})
		case errors.Is(err, identity.ErrForbidden):
			adminReadProblem(w, &domain.Error{Status: 403, Code: "forbidden"})
		default:
			adminReadProblem(w, err)
		}
		return
	}
	if actor.Role != "owner" && actor.Role != "staff" {
		adminReadProblem(w, &domain.Error{Status: 403, Code: "forbidden"})
		return
	}
	values, err := url.ParseQuery(r.URL.RawQuery)
	if err != nil {
		adminReadProblem(w, domain.BadAdminQuery())
		return
	}
	var result any
	switch {
	case r.PathValue("id") != "":
		if len(values) > 0 {
			adminReadProblem(w, domain.Validation("query", "unknown_field"))
			return
		}
		var order domain.AdminOrder
		order, err = h.service.Detail(r.Context(), strings.ToLower(r.PathValue("id")))
		if err == nil {
			result = order
			w.Header().Set("ETag", `"`+strconv.FormatInt(int64(order.Version), 10)+`"`)
		}
	case r.URL.Path == "/api/v1/admin/orders/metrics":
		result, err = h.service.Metrics(r.Context(), values, actor.Role)
	default:
		result, err = h.service.List(r.Context(), values)
	}
	if err != nil {
		adminReadProblem(w, err)
		return
	}
	body, err := json.Marshal(result)
	if err != nil {
		adminReadProblem(w, err)
		return
	}
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(body)
}
func adminReadProblem(w http.ResponseWriter, err error) {
	problem := &domain.Error{Status: 500, Code: "internal_error"}
	var known *domain.Error
	if errors.As(err, &known) {
		problem = known
	}
	body := struct {
		Type   string              `json:"type"`
		Title  string              `json:"title"`
		Status int                 `json:"status"`
		Code   string              `json:"code"`
		Detail string              `json:"detail"`
		Errors []domain.FieldError `json:"errors,omitempty"`
	}{Type: "https://monteluna.example/problems/" + strings.ReplaceAll(problem.Code, "_", "-"), Title: http.StatusText(problem.Status), Status: problem.Status, Code: problem.Code, Detail: "The request could not be completed; check the filters or sign in again.", Errors: problem.Fields}
	encoded, _ := json.Marshal(body)
	w.Header().Set("Content-Type", "application/problem+json")
	w.WriteHeader(problem.Status)
	_, _ = w.Write(encoded)
}

type adminReadWriter struct {
	http.ResponseWriter
	written bool
}

func (w *adminReadWriter) WriteHeader(status int) {
	if w.written {
		return
	}
	w.written = true
	w.Header().Set("Cache-Control", "no-store")
	w.ResponseWriter.WriteHeader(status)
}
func (w *adminReadWriter) Write(b []byte) (int, error) {
	if !w.written {
		w.WriteHeader(http.StatusOK)
	}
	return w.ResponseWriter.Write(b)
}
func (w *adminReadWriter) Unwrap() http.ResponseWriter { return w.ResponseWriter }
func adminReadNoStore(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		next.ServeHTTP(&adminReadWriter{ResponseWriter: w}, r)
	})
}
