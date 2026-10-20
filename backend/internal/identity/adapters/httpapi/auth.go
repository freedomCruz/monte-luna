package httpapi

import (
	"net/http"
	"strconv"
	"time"

	"github.com/freedomCruz/monte-luna/backend/internal/identity/domain"
)

type adminUser struct {
	ID                string  `json:"id"`
	Email             string  `json:"email"`
	DisplayName       string  `json:"display_name"`
	Role              string  `json:"role"`
	Status            string  `json:"status"`
	TOTPConfirmedAt   *string `json:"totp_confirmed_at"`
	LastLoginAt       *string `json:"last_login_at"`
	PasswordChangedAt string  `json:"password_changed_at"`
	Version           int32   `json:"version"`
	CreatedAt         string  `json:"created_at"`
	UpdatedAt         string  `json:"updated_at"`
}

func timestamp(t time.Time) string { return t.UTC().Format(time.RFC3339) }
func optional(t *time.Time) *string {
	if t == nil {
		return nil
	}
	value := timestamp(*t)
	return &value
}
func represent(r domain.AdminRecord) adminUser {
	u := r.User
	return adminUser{u.ID, u.Email, u.DisplayName, string(u.Role), string(u.Status), optional(r.TOTPConfirmedAt), optional(u.LastLoginAt), timestamp(u.PasswordChangedAt), u.Version, timestamp(u.CreatedAt), timestamp(u.UpdatedAt)}
}
func etag(version int32) string { return `"` + strconv.FormatInt(int64(version), 10) + `"` }

func (h *HTTP) login(w http.ResponseWriter, r *http.Request) {
	f, ok := h.object(w, r, "application/json", "email", "password")
	if !ok {
		return
	}
	var c checks
	email, _ := c.email(f, "email", true)
	password := c.secret(f, "password", "password")
	if c.failed(h, w) {
		return
	}
	state, err := h.Auth.Login(r.Context(), email, password, clientIP(r))
	if err != nil {
		h.fail(w, r, "loginAdmin", err)
		return
	}
	if err := h.Sessions.Replace(r.Context(), state); err != nil {
		h.fail(w, r, "loginAdmin", err)
		return
	}
	h.json(w, 200, map[string]string{"next_step": string(state.Stage)})
}

// pending reads the restricted session for exactly one staged step.
func (h *HTTP) session(w http.ResponseWriter, r *http.Request, stage domain.Stage, operation string) (domain.Session, bool) {
	state, err := h.Sessions.Current(r.Context(), stage)
	if err != nil {
		h.fail(w, r, operation, err)
		return domain.Session{}, false
	}
	return state, true
}

// authenticate swaps a completed step for a full session and returns its profile.
func (h *HTTP) authenticate(w http.ResponseWriter, r *http.Request, operation string, full domain.Session) (adminUser, bool) {
	if err := h.Sessions.Replace(r.Context(), full); err != nil {
		h.fail(w, r, operation, err)
		return adminUser{}, false
	}
	record, err := h.Auth.Profile(r.Context(), full)
	if err != nil {
		h.fail(w, r, operation, err)
		return adminUser{}, false
	}
	return represent(record), true
}

func (h *HTTP) verify(w http.ResponseWriter, r *http.Request) {
	pending, ok := h.session(w, r, domain.TOTPRequired, "verifyAdminSecondFactor")
	if !ok {
		return
	}
	f, ok := h.object(w, r, "application/json", "totp_code", "recovery_code")
	if !ok {
		return
	}
	var c checks
	proof := c.proofFields(f, "")
	if c.failed(h, w) {
		return
	}
	full, err := h.Auth.Verify(r.Context(), pending, proof, clientIP(r))
	if err != nil {
		h.fail(w, r, "verifyAdminSecondFactor", err)
		return
	}
	if user, ok := h.authenticate(w, r, "verifyAdminSecondFactor", full); ok {
		h.json(w, 200, user)
	}
}

func (h *HTTP) current(w http.ResponseWriter, r *http.Request) {
	state, ok := h.session(w, r, domain.Authenticated, "getCurrentAdmin")
	if !ok {
		return
	}
	record, err := h.Auth.Profile(r.Context(), state)
	if err != nil {
		h.fail(w, r, "getCurrentAdmin", err)
		return
	}
	w.Header().Set("ETag", etag(record.User.Version))
	h.json(w, 200, represent(record))
}

// logout destroys server state even when the audit write fails.
func (h *HTTP) logout(w http.ResponseWriter, r *http.Request) {
	if err := h.Auth.Logout(r.Context(), h.Sessions.State(r.Context()), clientIP(r)); err != nil {
		h.Logger.ErrorContext(r.Context(), "identity logout audit failed")
	}
	if err := h.Sessions.Destroy(r.Context()); err != nil {
		h.fail(w, r, "logoutAdmin", err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *HTTP) enroll(w http.ResponseWriter, r *http.Request) {
	pending, ok := h.session(w, r, domain.EnrollmentRequired, "enrollAdminTOTP")
	if !ok {
		return
	}
	enrollment, err := h.Auth.Enroll(r.Context(), pending, clientIP(r))
	if err != nil {
		h.fail(w, r, "enrollAdminTOTP", err)
		return
	}
	h.json(w, 200, map[string]string{"secret": enrollment.Secret, "otpauth_uri": enrollment.URI})
}

func (h *HTTP) confirm(w http.ResponseWriter, r *http.Request) {
	pending, ok := h.session(w, r, domain.EnrollmentRequired, "confirmAdminTOTP")
	if !ok {
		return
	}
	f, ok := h.object(w, r, "application/json", "totp_code")
	if !ok {
		return
	}
	var c checks
	code := c.totp(f, "totp_code", "totp_code")
	if c.failed(h, w) {
		return
	}
	full, codes, err := h.Auth.Confirm(r.Context(), pending, code, clientIP(r))
	if err != nil {
		h.fail(w, r, "confirmAdminTOTP", err)
		return
	}
	if user, ok := h.authenticate(w, r, "confirmAdminTOTP", full); ok {
		h.json(w, 200, map[string]any{"admin_user": user, "recovery_codes": codes})
	}
}

const resetAcknowledgement = "If the account is eligible, a password reset link will be emailed."

func (h *HTTP) requestReset(w http.ResponseWriter, r *http.Request) {
	f, ok := h.object(w, r, "application/json", "email")
	if !ok {
		return
	}
	var c checks
	email, _ := c.email(f, "email", true)
	if c.failed(h, w) {
		return
	}
	if err := h.Resets.Request(r.Context(), email, clientIP(r)); err != nil {
		h.fail(w, r, "requestAdminPasswordReset", err)
		return
	}
	h.json(w, 200, map[string]string{"message": resetAcknowledgement})
}

func (h *HTTP) completeReset(w http.ResponseWriter, r *http.Request) {
	f, ok := h.object(w, r, "application/json", "token", "new_password")
	if !ok {
		return
	}
	var c checks
	token := c.secret(f, "token", "token")
	password := c.newPassword(h.PasswordPolicy, f, "new_password")
	if c.failed(h, w) {
		return
	}
	if err := h.Resets.Complete(r.Context(), token, password, clientIP(r)); err != nil {
		h.fail(w, r, "completeAdminPasswordReset", err)
		return
	}
	h.json(w, 200, map[string]bool{"completed": true})
}

// reauthentication parses current_password plus the nested second factor.
func (h *HTTP) reauthentication(w http.ResponseWriter, r *http.Request, extra ...string) (fields, string, domain.Proof, *checks, bool) {
	f, ok := h.object(w, r, "application/json", append([]string{"current_password", "second_factor"}, extra...)...)
	if !ok {
		return nil, "", domain.Proof{}, nil, false
	}
	c := &checks{}
	password := c.secret(f, "current_password", "current_password")
	var proof domain.Proof
	if raw, present := f["second_factor"]; present {
		proof = c.proof(raw, "second_factor")
	} else {
		c.add("second_factor", "required", "This field is required.")
	}
	return f, password, proof, c, true
}

func (h *HTTP) changePassword(w http.ResponseWriter, r *http.Request) {
	state, ok := h.session(w, r, domain.Authenticated, "changeAdminPassword")
	if !ok {
		return
	}
	f, current, proof, c, ok := h.reauthentication(w, r, "new_password")
	if !ok {
		return
	}
	next := c.newPassword(h.PasswordPolicy, f, "new_password")
	if c.failed(h, w) {
		return
	}
	if err := h.Management.ChangePassword(r.Context(), state, current, next, proof, audit(r)); err != nil {
		h.fail(w, r, "changeAdminPassword", err)
		return
	}
	h.json(w, 200, map[string]bool{"completed": true})
}

func (h *HTTP) regenerate(w http.ResponseWriter, r *http.Request) {
	state, ok := h.session(w, r, domain.Authenticated, "regenerateAdminRecoveryCodes")
	if !ok {
		return
	}
	_, current, proof, c, ok := h.reauthentication(w, r)
	if !ok || c.failed(h, w) {
		return
	}
	codes, err := h.Auth.Regenerate(r.Context(), state, current, proof, clientIP(r))
	if err != nil {
		h.fail(w, r, "regenerateAdminRecoveryCodes", err)
		return
	}
	h.json(w, 200, map[string][]string{"recovery_codes": codes})
}
