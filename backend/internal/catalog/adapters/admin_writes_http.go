package adapters

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"mime"
	"net/http"
	"net/url"
	"strconv"

	"github.com/freedomCruz/monte-luna/backend/internal/catalog/domain"
	"github.com/freedomCruz/monte-luna/backend/internal/identity"
)

type AdminWriteUseCases interface {
	Write(context.Context, domain.AdminWrite) (domain.AdminWriteResult, error)
}
type AdminWriteHTTP struct {
	service AdminWriteUseCases
	access  identity.AccessChecker
}

func NewAdminWriteHTTP(service AdminWriteUseCases, access identity.AccessChecker) (*AdminWriteHTTP, error) {
	if service == nil || access == nil {
		return nil, errors.New("catalog write dependencies are required")
	}
	return &AdminWriteHTTP{service, access}, nil
}
func (h *AdminWriteHTTP) RegisterRoutes(mux *http.ServeMux, sessions func(http.Handler) http.Handler) {
	origin := http.NewCrossOriginProtection()
	origin.SetDenyHandler(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		mediaProblem(w, &domain.Error{Status: 403, Code: "cross_origin_rejected"})
	}))
	for _, route := range []struct{ pattern, kind string }{
		{"POST /api/v1/admin/products", "create-product"}, {"PATCH /api/v1/admin/products/{id}", "update-product"},
		{"POST /api/v1/admin/products/{id}/variants", "create-variant"}, {"PATCH /api/v1/admin/products/{id}/variants/{variant_id}", "update-variant"},
	} {
		mux.Handle(route.pattern, mediaNoStore(origin.Handler(sessions(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { h.write(w, r, route.kind) })))))
	}
}
func (h *AdminWriteHTTP) write(w http.ResponseWriter, r *http.Request, kind string) {
	actor, err := h.access.Require(r.Context(), "catalog")
	if err != nil {
		switch {
		case errors.Is(err, identity.ErrAuthenticationRequired):
			mediaProblem(w, &domain.Error{Status: 401, Code: "authentication_required"})
		case errors.Is(err, identity.ErrForbidden):
			mediaProblem(w, &domain.Error{Status: 403, Code: "forbidden"})
		default:
			mediaProblem(w, err)
		}
		return
	}
	if actor.Role != "owner" && actor.Role != "staff" {
		mediaProblem(w, &domain.Error{Status: 403, Code: "forbidden"})
		return
	}
	bad := &domain.Error{Status: 400, Code: "bad_request"}
	id, variant := r.PathValue("id"), r.PathValue("variant_id")
	if kind != "create-product" && !domain.ValidAdminID(id) || variant != "" && !domain.ValidAdminID(variant) {
		mediaProblem(w, bad)
		return
	}
	if r.URL.RawQuery != "" {
		if _, err := url.ParseQuery(r.URL.RawQuery); err != nil {
			mediaProblem(w, bad)
		} else {
			mediaProblem(w, domain.AdminInvalid("query"))
		}
		return
	}
	in := domain.AdminWrite{Kind: kind, ProductID: id, VariantID: variant, ActorID: actor.ID}
	if kind != "create-product" {
		in.Version, err = productMatch(r)
		if err != nil {
			mediaProblem(w, err)
			return
		}
	}
	content, _, err := mime.ParseMediaType(r.Header.Get("Content-Type"))
	expected := "application/json"
	if r.Method == "PATCH" {
		expected = "application/merge-patch+json"
	}
	if err != nil || content != expected {
		mediaProblem(w, bad)
		return
	}
	decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<20))
	if err := decoder.Decode(&in.Fields); err != nil {
		mediaProblem(w, bad)
		return
	}
	if err := decoder.Decode(new(any)); err != io.EOF {
		mediaProblem(w, bad)
		return
	}
	out, err := h.service.Write(r.Context(), in)
	if err != nil {
		mediaProblem(w, err)
		return
	}
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("ETag", `"`+strconv.Itoa(int(out.ProductVersion))+`"`)
	status := 200
	var body any
	switch {
	case out.Product != nil:
		body = out.Product
		if kind == "create-product" {
			status = 201
			w.Header().Set("Location", "/api/v1/admin/products/"+out.Product.ID)
		}
	case out.Variant != nil:
		body = out.Variant
		if kind == "create-variant" {
			status = 201
			w.Header().Set("Location", "/api/v1/admin/products/"+id+"/variants/"+out.Variant.ID)
		}
	case out.Receipt != nil:
		body = out.Receipt
	}
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}
