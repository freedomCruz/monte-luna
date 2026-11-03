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
	"github.com/freedomCruz/monte-luna/backend/internal/orders/app"
	"github.com/freedomCruz/monte-luna/backend/internal/orders/domain"
)

var strongVersion = regexp.MustCompile(`^"[1-9][0-9]*"$`)

type AdminWriteHTTP struct {
	service *app.AdminWrites
	access  identity.AccessChecker
}

func NewAdminWriteHTTP(service *app.AdminWrites, access identity.AccessChecker) (*AdminWriteHTTP, error) {
	if service == nil || access == nil {
		return nil, errors.New("orders admin write HTTP dependencies required")
	}
	return &AdminWriteHTTP{service, access}, nil
}

func (h *AdminWriteHTTP) RegisterRoutes(mux *http.ServeMux, sessions func(http.Handler) http.Handler) {
	origin := http.NewCrossOriginProtection()
	origin.SetDenyHandler(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		adminReadProblem(w, &domain.Error{Status: 403, Code: "cross_origin_rejected"})
	}))
	for path, action := range map[string]string{"to-preparing": domain.AdminPrepare, "deliver": domain.AdminDeliver, "cancel": domain.AdminCancel} {
		route := "/api/v1/admin/orders/{id}/" + path
		mux.Handle("POST "+route, adminReadNoStore(origin.Handler(sessions(h.write(action)))))
		mux.Handle(route, adminReadNoStore(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
			w.Header().Set("Allow", "POST")
			http.Error(w, http.StatusText(http.StatusMethodNotAllowed), http.StatusMethodNotAllowed)
		})))
	}
}

func (h *AdminWriteHTTP) write(action string) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
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
		matches := r.Header.Values("If-Match")
		if len(matches) == 0 {
			adminReadProblem(w, &domain.Error{Status: 412, Code: "version_conflict"})
			return
		}
		if len(matches) != 1 || !strongVersion.MatchString(matches[0]) {
			adminReadProblem(w, domain.BadAdminQuery())
			return
		}
		version, err := strconv.ParseInt(strings.Trim(matches[0], `"`), 10, 32)
		if err != nil {
			adminReadProblem(w, domain.BadAdminQuery())
			return
		}
		reason, err := adminActionBody(w, r, action)
		if err != nil {
			adminReadProblem(w, err)
			return
		}
		order, err := h.service.Apply(r.Context(), action, strings.ToLower(r.PathValue("id")), int32(version), actor.ID, reason)
		if err != nil {
			adminReadProblem(w, err)
			return
		}
		body, err := json.Marshal(order)
		if err != nil {
			adminReadProblem(w, err)
			return
		}
		w.Header().Set("ETag", `"`+strconv.FormatInt(int64(order.Version), 10)+`"`)
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write(body)
	})
}

// adminActionBody accepts {} for every action plus an optional nullable
// reason for cancel; problems never echo arbitrary input.
func adminActionBody(w http.ResponseWriter, r *http.Request, action string) (*string, error) {
	if media, _, err := mime.ParseMediaType(r.Header.Get("Content-Type")); err != nil || media != "application/json" {
		return nil, domain.BadAdminQuery()
	}
	data, err := io.ReadAll(http.MaxBytesReader(w, r.Body, 16<<10))
	if err != nil || !json.Valid(data) {
		return nil, domain.BadAdminQuery()
	}
	var fields map[string]json.RawMessage
	if json.Unmarshal(data, &fields) != nil || fields == nil {
		return nil, domain.Validation("body", "invalid_type")
	}
	var reason *string
	for key, raw := range fields {
		if action != domain.AdminCancel || key != "reason" {
			return nil, domain.Validation("body", "unknown_field")
		}
		if json.Unmarshal(raw, &reason) != nil {
			return nil, domain.Validation("reason", "invalid_type")
		}
	}
	return reason, nil
}
