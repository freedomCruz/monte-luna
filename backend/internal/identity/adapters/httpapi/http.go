// Package httpapi implements contracts/openapi/identity.yaml over net/http.
// It never logs request bodies, cookies, passwords, codes, or tokens.
package httpapi

import (
	"bytes"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"math"
	"mime"
	"net"
	"net/http"
	"net/mail"
	"net/netip"
	"regexp"
	"slices"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/freedomCruz/monte-luna/backend/internal/identity/adapters/session"
	"github.com/freedomCruz/monte-luna/backend/internal/identity/app"
	"github.com/freedomCruz/monte-luna/backend/internal/identity/domain"
)

const maxBodyBytes = 16 << 10

// Deps are the already-wired application services. PasswordPolicy repeats the
// app check before any credential work so violations carry a field error.
type Deps struct {
	Auth           *app.Auth
	Management     *app.Management
	Resets         *app.PasswordResets
	Sessions       *session.Sessions
	PasswordPolicy domain.PasswordPolicy
	Logger         *slog.Logger
}
type HTTP struct {
	Deps
	origin *http.CrossOriginProtection
}

func New(d Deps) (*HTTP, error) {
	if d.Auth == nil || d.Management == nil || d.Resets == nil || d.Sessions == nil || d.PasswordPolicy == nil {
		return nil, domain.ErrValidation
	}
	if d.Logger == nil {
		d.Logger = slog.Default()
	}
	h := &HTTP{Deps: d, origin: http.NewCrossOriginProtection()}
	h.origin.SetDenyHandler(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		h.write(w, problem{status: 403, code: "cross_origin_rejected"})
	}))
	// Replace the SCS fallback so session-store failures still answer with a
	// contract Problem; the underlying error may describe stored state.
	d.Sessions.Manager.ErrorFunc = func(w http.ResponseWriter, _ *http.Request, _ error) {
		h.write(w, problem{status: 500, code: "internal_error"})
	}
	return h, nil
}

func (h *HTTP) RegisterRoutes(mux *http.ServeMux) {
	for pattern, handler := range map[string]http.HandlerFunc{
		"POST /api/v1/admin/sessions":                  h.login,
		"POST /api/v1/admin/sessions/verify":           h.verify,
		"GET /api/v1/admin/sessions/current":           h.current,
		"DELETE /api/v1/admin/sessions/current":        h.logout,
		"POST /api/v1/admin/totp/enroll":               h.enroll,
		"POST /api/v1/admin/totp/confirm":              h.confirm,
		"POST /api/v1/admin/password-resets":           h.requestReset,
		"POST /api/v1/admin/password-resets/complete":  h.completeReset,
		"POST /api/v1/admin/password/change":           h.changePassword,
		"POST /api/v1/admin/recovery-codes/regenerate": h.regenerate,
	} {
		mux.Handle(pattern, noStore(h.origin.Handler(h.Sessions.Manager.LoadAndSave(handler))))
	}
}

// noStore pins exactly one Cache-Control value. SCS appends its own
// no-cache="Set-Cookie" directive while writing the cookie.
type noStoreWriter struct {
	http.ResponseWriter
	done bool
}

func (w *noStoreWriter) WriteHeader(status int) {
	if !w.done {
		w.done = true
		w.Header().Set("Cache-Control", "no-store")
	}
	w.ResponseWriter.WriteHeader(status)
}
func (w *noStoreWriter) Write(b []byte) (int, error) {
	if !w.done {
		w.WriteHeader(http.StatusOK)
	}
	return w.ResponseWriter.Write(b)
}
func (w *noStoreWriter) Unwrap() http.ResponseWriter { return w.ResponseWriter }

func noStore(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		next.ServeHTTP(&noStoreWriter{ResponseWriter: w}, r)
	})
}

type fieldError struct {
	Field   string `json:"field"`
	Code    string `json:"code"`
	Message string `json:"message"`
}
type problem struct {
	status     int
	code       string
	fields     []fieldError
	retryAfter time.Duration
}

var titles = map[string][2]string{
	"bad_request":             {"Malformed request", "The request could not be parsed."},
	"invalid_credentials":     {"Invalid credentials", "The credentials are not valid."},
	"authentication_required": {"Authentication required", "Sign in to continue."},
	"forbidden":               {"Forbidden", "You are not allowed to perform this action."},
	"cross_origin_rejected":   {"Cross-origin request rejected", "Cross-origin requests are not allowed."},
	"admin_user_not_found":    {"Administrator not found", "The administrator does not exist."},
	"email_conflict":          {"Email already in use", "Another administrator already uses this email."},
	"last_active_owner":       {"Last active owner", "At least one active owner must remain."},
	"totp_already_enrolled":   {"Two-factor already enrolled", "Two-factor authentication is already enrolled."},
	"version_conflict":        {"Version conflict", "The administrator changed; reload and try again."},
	"validation_failed":       {"Validation failed", "One or more fields are invalid."},
	"invalid_reset_token":     {"Invalid link", "This link is invalid or has expired."},
	"rate_limited":            {"Too many attempts", "Too many attempts; try again later."},
	"internal_error":          {"Unexpected server error", "The request could not be completed."},
}

func (h *HTTP) write(w http.ResponseWriter, p problem) {
	text := titles[p.code]
	body, err := json.Marshal(struct {
		Type   string       `json:"type"`
		Title  string       `json:"title"`
		Status int          `json:"status"`
		Code   string       `json:"code"`
		Detail string       `json:"detail"`
		Errors []fieldError `json:"errors,omitempty"`
	}{"https://monteluna.example/problems/" + strings.ReplaceAll(p.code, "_", "-"), text[0], p.status, p.code, text[1], p.fields})
	if err != nil {
		w.WriteHeader(500)
		return
	}
	if p.status == 429 {
		seconds := int64(math.Ceil(p.retryAfter.Seconds()))
		if seconds < 1 {
			seconds = 1
		}
		w.Header().Set("Retry-After", strconv.FormatInt(seconds, 10))
	}
	w.Header().Set("Content-Type", "application/problem+json")
	w.WriteHeader(p.status)
	_, _ = w.Write(body)
}

// fail maps application errors to the contract's stable codes. Unknown errors
// are logged by operation name only: they may embed stored values.
func (h *HTTP) fail(w http.ResponseWriter, r *http.Request, operation string, err error) {
	var limited *domain.RateLimitError
	switch {
	case errors.As(err, &limited):
		h.write(w, problem{status: 429, code: "rate_limited", retryAfter: limited.RetryAfter})
	case errors.Is(err, domain.ErrRateLimited):
		h.write(w, problem{status: 429, code: "rate_limited", retryAfter: time.Second})
	case errors.Is(err, domain.ErrInvalidCredentials):
		h.write(w, problem{status: 401, code: "invalid_credentials"})
	case errors.Is(err, domain.ErrAuthenticationRequired):
		h.write(w, problem{status: 401, code: "authentication_required"})
	case errors.Is(err, domain.ErrForbidden):
		h.write(w, problem{status: 403, code: "forbidden"})
	case errors.Is(err, domain.ErrNotFound):
		h.write(w, problem{status: 404, code: "admin_user_not_found"})
	case errors.Is(err, domain.ErrEmailConflict):
		h.write(w, problem{status: 409, code: "email_conflict"})
	case errors.Is(err, domain.ErrLastActiveOwner):
		h.write(w, problem{status: 409, code: "last_active_owner"})
	case errors.Is(err, domain.ErrTOTPEnrolled):
		h.write(w, problem{status: 409, code: "totp_already_enrolled"})
	case errors.Is(err, domain.ErrVersionConflict):
		h.write(w, problem{status: 412, code: "version_conflict"})
	case errors.Is(err, domain.ErrInvalidResetToken):
		h.write(w, problem{status: 422, code: "invalid_reset_token"})
	case errors.Is(err, domain.ErrValidation):
		h.write(w, problem{status: 422, code: "validation_failed"})
	default:
		h.Logger.ErrorContext(r.Context(), "identity request failed", "operation", operation)
		h.write(w, problem{status: 500, code: "internal_error"})
	}
}

func (h *HTTP) json(w http.ResponseWriter, status int, value any) {
	body, err := json.Marshal(value)
	if err != nil {
		h.write(w, problem{status: 500, code: "internal_error"})
		return
	}
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_, _ = w.Write(body)
}

// clientIP trusts only the nearest proxy's appended X-Forwarded-For entry and
// only when that proxy is on a loopback or private network (Caddy on the VPS).
func clientIP(r *http.Request) string {
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		host = r.RemoteAddr
	}
	peer, err := netip.ParseAddr(host)
	if err != nil {
		return "0.0.0.0"
	}
	peer = peer.Unmap()
	if peer.IsLoopback() || peer.IsPrivate() {
		values := r.Header.Values("X-Forwarded-For")
		if len(values) > 0 {
			entries := strings.Split(values[len(values)-1], ",")
			if forwarded, err := netip.ParseAddr(strings.TrimSpace(entries[len(entries)-1])); err == nil {
				return forwarded.Unmap().String()
			}
		}
	}
	return peer.String()
}

func audit(r *http.Request) domain.AuditContext {
	agent := strings.ToValidUTF8(strings.ReplaceAll(r.UserAgent(), "\x00", ""), "")
	if utf8.RuneCountInString(agent) > 256 {
		agent = string([]rune(agent)[:256])
	}
	return domain.AuditContext{IP: clientIP(r), UserAgent: agent}
}

// fields is a strictly decoded JSON object. Malformed JSON is 400; a wrong
// shape, unknown member, null, or invalid value is 422 with field errors.
type fields map[string]json.RawMessage

func (h *HTTP) object(w http.ResponseWriter, r *http.Request, media string, allowed ...string) (fields, bool) {
	if kind, _, err := mime.ParseMediaType(r.Header.Get("Content-Type")); err != nil || kind != media {
		h.write(w, problem{status: 400, code: "bad_request"})
		return nil, false
	}
	data, err := io.ReadAll(http.MaxBytesReader(w, r.Body, maxBodyBytes))
	if err != nil || !json.Valid(data) {
		h.write(w, problem{status: 400, code: "bad_request"})
		return nil, false
	}
	var out fields
	if bytes.HasPrefix(bytes.TrimSpace(data), []byte("null")) || json.Unmarshal(data, &out) != nil {
		h.write(w, problem{status: 422, code: "validation_failed"})
		return nil, false
	}
	var unknown []fieldError
	for name := range out {
		if !slices.Contains(allowed, name) {
			unknown = append(unknown, fieldError{name, "unknown_field", "This field is not allowed."})
		}
	}
	if len(unknown) > 0 {
		slices.SortFunc(unknown, func(a, b fieldError) int { return strings.Compare(a.Field, b.Field) })
		h.write(w, problem{status: 422, code: "validation_failed", fields: unknown})
		return nil, false
	}
	return out, true
}

type checks struct{ errs []fieldError }

func (c *checks) add(field, code, message string) {
	c.errs = append(c.errs, fieldError{field, code, message})
}
func (c *checks) failed(h *HTTP, w http.ResponseWriter) bool {
	if len(c.errs) == 0 {
		return false
	}
	h.write(w, problem{status: 422, code: "validation_failed", fields: c.errs})
	return true
}

// text reads an optional or required non-null string member.
func (c *checks) text(f fields, name, path string, required bool) (string, bool) {
	raw, present := f[name]
	if !present {
		if required {
			c.add(path, "required", "This field is required.")
		}
		return "", false
	}
	var value *string
	if json.Unmarshal(raw, &value) != nil || value == nil {
		c.add(path, "invalid", "This field must be a string.")
		return "", false
	}
	return *value, true
}
func (c *checks) secret(f fields, name, path string) string {
	value, ok := c.text(f, name, path, true)
	if ok && value == "" {
		c.add(path, "required", "This field is required.")
	}
	return value
}
func (c *checks) email(f fields, name string, required bool) (string, bool) {
	value, ok := c.text(f, name, name, required)
	if !ok {
		return "", false
	}
	normalized := strings.ToLower(strings.TrimSpace(value))
	if address, err := mail.ParseAddress(normalized); err != nil || address.Address != normalized {
		c.add(name, "invalid_email", "Enter a valid email address.")
		return "", false
	}
	return normalized, true
}
func (c *checks) newPassword(policy domain.PasswordPolicy, f fields, name string) string {
	value := c.secret(f, name, name)
	if value != "" && policy(value) != nil {
		c.add(name, "password_policy", "Use 12 to 128 characters.")
	}
	return value
}

var totpPattern = regexp.MustCompile(`^[0-9]{6}$`)

func (c *checks) totp(f fields, name, path string) string {
	value, ok := c.text(f, name, path, true)
	if ok && !totpPattern.MatchString(value) {
		c.add(path, "invalid", "Enter the six-digit code.")
	}
	return value
}

// proof accepts exactly one of totp_code or recovery_code.
func (c *checks) proof(raw json.RawMessage, path string) domain.Proof {
	var f fields
	if json.Unmarshal(raw, &f) != nil || f == nil {
		c.add(path, "invalid", "Provide a TOTP code or a recovery code.")
		return domain.Proof{}
	}
	return c.proofFields(f, path)
}
func (c *checks) proofFields(f fields, path string) domain.Proof {
	prefix := ""
	if path != "" {
		prefix = path + "."
	}
	for name := range f {
		if name != "totp_code" && name != "recovery_code" {
			c.add(prefix+name, "unknown_field", "This field is not allowed.")
		}
	}
	_, hasTOTP := f["totp_code"]
	_, hasRecovery := f["recovery_code"]
	if hasTOTP == hasRecovery {
		c.add(strings.TrimSuffix(prefix, "."), "invalid", "Provide exactly one of a TOTP code or a recovery code.")
		return domain.Proof{}
	}
	if hasTOTP {
		return domain.Proof{TOTP: c.totp(f, "totp_code", prefix+"totp_code")}
	}
	code := c.secret(f, "recovery_code", prefix+"recovery_code")
	if len(code) > 256 {
		c.add(prefix+"recovery_code", "invalid", "The recovery code is not valid.")
	}
	return domain.Proof{RecoveryCode: code}
}
