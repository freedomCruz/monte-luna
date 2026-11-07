package adapters

import (
	"encoding/json"
	"errors"
	"net/http"
	"net/url"
	"strconv"
	"strings"

	"github.com/freedomCruz/monte-luna/backend/internal/catalog/app"
	"github.com/freedomCruz/monte-luna/backend/internal/catalog/domain"
	"github.com/freedomCruz/monte-luna/backend/internal/identity"
)

type AdminReadHTTP struct {
	service *app.AdminReads
	access  identity.AccessChecker
}

func NewAdminReadHTTP(service *app.AdminReads, access identity.AccessChecker) (*AdminReadHTTP, error) {
	if service == nil || access == nil {
		return nil, errors.New("catalog admin read dependencies are required")
	}
	return &AdminReadHTTP{service, access}, nil
}
func (h *AdminReadHTTP) RegisterRoutes(mux *http.ServeMux, sessions func(http.Handler) http.Handler) {
	for _, route := range []struct{ path, kind string }{
		{"/api/v1/admin/products", "products"}, {"/api/v1/admin/products/{id}", "product"}, {"/api/v1/admin/products/{id}/variants/{variant_id}", "variant"},
		{"/api/v1/admin/catalog/categories", "categories"}, {"/api/v1/admin/catalog/origins", "origins"}, {"/api/v1/admin/catalog/brands", "brands"}, {"/api/v1/admin/catalog/product-types", "product-types"},
		{"/api/v1/admin/inventory/variants", "inventory"}, {"/api/v1/admin/inventory/variants/{id}", "inventory-detail"}, {"/api/v1/admin/inventory/variants/{id}/lots", "lots"}, {"/api/v1/admin/inventory/variants/{id}/movements", "movements"},
	} {
		mux.Handle("GET "+route.path, mediaNoStore(sessions(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { h.read(w, r, route.kind) }))))
	}
}
func (h *AdminReadHTTP) read(w http.ResponseWriter, r *http.Request, kind string) {
	actor, err := h.access.Require(r.Context(), "catalog")
	if err != nil {
		switch {
		case errors.Is(err, identity.ErrAuthenticationRequired):
			err = &domain.Error{Status: 401, Code: "authentication_required"}
		case errors.Is(err, identity.ErrForbidden):
			err = &domain.Error{Status: 403, Code: "forbidden"}
		}
		adminReadProblem(w, err)
		return
	}
	if actor.Role != "owner" && actor.Role != "staff" {
		adminReadProblem(w, &domain.Error{Status: 403, Code: "forbidden"})
		return
	}
	values, err := url.ParseQuery(r.URL.RawQuery)
	if err != nil {
		adminReadProblem(w, &domain.Error{Status: 400, Code: "bad_request"})
		return
	}
	f, err := domain.ParseAdminReadFilter(kind, r.PathValue("id"), values)
	if err != nil {
		adminReadProblem(w, err)
		return
	}
	var body any
	var version int32
	switch kind {
	case "products":
		body, err = h.service.Products(r.Context(), f)
	case "product", "variant":
		var product domain.AdminProduct
		if kind == "variant" && !domain.ValidAdminID(r.PathValue("variant_id")) {
			adminReadProblem(w, &domain.Error{Status: 400, Code: "bad_request"})
			return
		}
		product, err = h.service.Product(r.Context(), f.ID)
		version = product.Version
		body = product
		if err == nil && kind == "variant" {
			found := false
			for _, v := range product.Variants {
				if v.ID == r.PathValue("variant_id") {
					body = v
					found = true
					break
				}
			}
			if !found {
				err = &domain.Error{Status: 404, Code: "variant_not_found"}
			}
		}
	case "inventory", "inventory-detail":
		var page domain.AdminInventoryPage[domain.AdminInventoryVariant]
		page, err = h.service.Inventory(r.Context(), f)
		body = page
		if err == nil && kind == "inventory-detail" {
			if len(page.Items) != 1 {
				err = &domain.Error{Status: 404, Code: "variant_not_found"}
			} else {
				body = page.Items[0]
				version = page.Items[0].ProductVersion
			}
		}
	case "lots":
		body, err = h.service.Lots(r.Context(), f)
	case "movements":
		body, err = h.service.Movements(r.Context(), f)
	default:
		body, err = h.service.Taxonomy(r.Context(), f)
	}
	if err != nil {
		adminReadProblem(w, err)
		return
	}
	data, err := json.Marshal(body)
	if err != nil {
		adminReadProblem(w, err)
		return
	}
	if version > 0 {
		w.Header().Set("ETag", `"`+strconv.FormatInt(int64(version), 10)+`"`)
	}
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(data)
}
func adminReadProblem(w http.ResponseWriter, err error) {
	p := &domain.Error{Status: 500, Code: "internal_error"}
	var known *domain.Error
	if errors.As(err, &known) {
		p = known
	}
	body := struct {
		Type   string `json:"type"`
		Title  string `json:"title"`
		Status int    `json:"status"`
		Code   string `json:"code"`
		Detail string `json:"detail"`
	}{"https://monteluna.example/problems/" + strings.ReplaceAll(p.Code, "_", "-"), http.StatusText(p.Status), p.Status, p.Code, "The catalog request could not be completed."}
	data, _ := json.Marshal(body)
	w.Header().Set("Content-Type", "application/problem+json")
	w.WriteHeader(p.Status)
	_, _ = w.Write(data)
}
