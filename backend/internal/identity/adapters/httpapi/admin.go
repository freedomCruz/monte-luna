package httpapi

import (
	"encoding/base64"
	"net/http"
	"regexp"
	"strconv"
	"strings"

	"github.com/freedomCruz/monte-luna/backend/internal/identity/domain"
)

var (
	uuidPattern    = regexp.MustCompile(`^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`)
	versionPattern = regexp.MustCompile(`^"[1-9][0-9]*"$`)
)

const cursorPrefix = "admin:"

func (h *HTTP) listUsers(w http.ResponseWriter, r *http.Request) {
	state, ok := h.session(w, r, domain.Authenticated, "listAdminUsers")
	if !ok {
		return
	}
	query := r.URL.Query()
	limit := 24
	if values, present := query["limit"]; present {
		parsed, err := strconv.Atoi(values[0])
		if len(values) != 1 || err != nil || parsed < 1 || parsed > 100 {
			h.write(w, problem{status: 400, code: "bad_request"})
			return
		}
		limit = parsed
	}
	after := ""
	if values, present := query["cursor"]; present {
		decoded, err := base64.RawURLEncoding.DecodeString(values[0])
		id := strings.TrimPrefix(string(decoded), cursorPrefix)
		if len(values) != 1 || err != nil || !strings.HasPrefix(string(decoded), cursorPrefix) || !uuidPattern.MatchString(id) {
			h.write(w, problem{status: 400, code: "bad_request"})
			return
		}
		after = id
	}
	records, more, err := h.Management.Page(r.Context(), state, after, limit)
	if err != nil {
		h.fail(w, r, "listAdminUsers", err)
		return
	}
	items := make([]adminUser, 0, len(records))
	for _, record := range records {
		items = append(items, represent(record))
	}
	var next *string
	if more && len(records) > 0 {
		cursor := base64.RawURLEncoding.EncodeToString([]byte(cursorPrefix + records[len(records)-1].User.ID))
		next = &cursor
	}
	h.json(w, 200, map[string]any{"items": items, "next_cursor": next})
}

func (h *HTTP) createUser(w http.ResponseWriter, r *http.Request) {
	state, ok := h.session(w, r, domain.Authenticated, "createAdminUser")
	if !ok {
		return
	}
	f, ok := h.object(w, r, "application/json", "email", "display_name", "role")
	if !ok {
		return
	}
	var c checks
	email, _ := c.email(f, "email", true)
	name, _ := c.name(f, true)
	role, _ := c.role(f, true)
	if c.failed(h, w) {
		return
	}
	record, err := h.Management.Invite(r.Context(), state, email, name, role, audit(r))
	if err != nil {
		h.fail(w, r, "createAdminUser", err)
		return
	}
	w.Header().Set("Location", "/api/v1/admin/users/"+record.User.ID)
	w.Header().Set("ETag", etag(record.User.Version))
	h.json(w, 201, represent(record))
}

// target authorizes the caller before revealing whether the target exists.
func (h *HTTP) target(w http.ResponseWriter, r *http.Request, operation string) (domain.Session, string, bool) {
	state, ok := h.session(w, r, domain.Authenticated, operation)
	if !ok {
		return domain.Session{}, "", false
	}
	id := r.PathValue("id")
	if !uuidPattern.MatchString(id) {
		// Owner authorization still precedes the not-found answer.
		if _, err := h.Management.Get(r.Context(), state, ""); err != nil {
			h.fail(w, r, operation, err)
			return domain.Session{}, "", false
		}
		h.write(w, problem{status: 404, code: "admin_user_not_found"})
		return domain.Session{}, "", false
	}
	return state, id, true
}

// precondition reads the mandatory strong If-Match version.
func (h *HTTP) precondition(w http.ResponseWriter, r *http.Request) (int32, bool) {
	values := r.Header.Values("If-Match")
	if len(values) == 0 {
		h.write(w, problem{status: 412, code: "version_conflict"})
		return 0, false
	}
	if len(values) != 1 || !versionPattern.MatchString(values[0]) {
		h.write(w, problem{status: 400, code: "bad_request"})
		return 0, false
	}
	version, err := strconv.ParseInt(strings.Trim(values[0], `"`), 10, 32)
	if err != nil {
		h.write(w, problem{status: 400, code: "bad_request"})
		return 0, false
	}
	return int32(version), true
}

func (h *HTTP) getUser(w http.ResponseWriter, r *http.Request) {
	state, id, ok := h.target(w, r, "getAdminUser")
	if !ok {
		return
	}
	record, err := h.Management.Get(r.Context(), state, id)
	if err != nil {
		h.fail(w, r, "getAdminUser", err)
		return
	}
	w.Header().Set("ETag", etag(record.User.Version))
	h.json(w, 200, represent(record))
}

func (h *HTTP) updateUser(w http.ResponseWriter, r *http.Request) {
	state, id, ok := h.target(w, r, "updateAdminUser")
	if !ok {
		return
	}
	version, ok := h.precondition(w, r)
	if !ok {
		return
	}
	f, ok := h.object(w, r, "application/merge-patch+json", "email", "display_name", "role", "status")
	if !ok {
		return
	}
	var c checks
	var changes domain.UserChanges
	if email, present := c.email(f, "email", false); present {
		changes.Email = &email
	}
	if name, present := c.name(f, false); present {
		changes.DisplayName = &name
	}
	if role, present := c.role(f, false); present {
		changes.Role = &role
	}
	if raw, present := c.text(f, "status", "status", false); present {
		status := domain.Status(raw)
		if status != domain.Active && status != domain.Disabled {
			c.add("status", "invalid", "Use active or disabled.")
		}
		changes.Status = &status
	}
	if len(f) == 0 {
		c.add("", "required", "Provide at least one field to update.")
	}
	if c.failed(h, w) {
		return
	}
	record, err := h.Management.Update(r.Context(), state, id, version, changes, audit(r))
	if err != nil {
		h.fail(w, r, "updateAdminUser", err)
		return
	}
	w.Header().Set("ETag", etag(record.User.Version))
	h.json(w, 200, represent(record))
}

func (h *HTTP) resetTOTP(w http.ResponseWriter, r *http.Request) {
	state, id, ok := h.target(w, r, "resetAdminUserTOTP")
	if !ok {
		return
	}
	version, ok := h.precondition(w, r)
	if !ok {
		return
	}
	_, current, proof, c, ok := h.reauthentication(w, r)
	if !ok || c.failed(h, w) {
		return
	}
	record, err := h.Management.ResetTOTP(r.Context(), state, id, version, current, proof, audit(r))
	if err != nil {
		h.fail(w, r, "resetAdminUserTOTP", err)
		return
	}
	w.Header().Set("ETag", etag(record.User.Version))
	h.json(w, 200, represent(record))
}

func (c *checks) name(f fields, required bool) (string, bool) {
	value, present := c.text(f, "display_name", "display_name", required)
	if present && strings.TrimSpace(value) == "" {
		c.add("display_name", "required", "Enter a display name.")
	}
	return value, present
}
func (c *checks) role(f fields, required bool) (domain.Role, bool) {
	value, present := c.text(f, "role", "role", required)
	role := domain.Role(value)
	if present && role != domain.Owner && role != domain.Staff {
		c.add("role", "invalid", "Use owner or staff.")
	}
	return role, present
}
