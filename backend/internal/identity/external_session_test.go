package identity_test

import (
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/freedomCruz/monte-luna/backend/internal/identity"
)

func TestExternalAdminSessionMiddleware(t *testing.T) {
	h := newHarness(t)
	check := func(cookie string, wantAllowed bool) {
		t.Helper()
		called := false
		handler := h.module.LoadAdminSession(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			called = true
			principal, err := h.module.Access().Require(r.Context(), "orders")
			if wantAllowed {
				if err != nil || principal.Role != "owner" || principal.ID == "" {
					t.Fatalf("principal=%+v err=%v", principal, err)
				}
			} else if !errors.Is(err, identity.ErrAuthenticationRequired) {
				t.Fatalf("expected authentication_required, got %v", err)
			}
			w.WriteHeader(204)
		}))
		req := httptest.NewRequest("GET", "/admin-external-test", nil)
		if cookie != "" {
			req.AddCookie(&http.Cookie{Name: "__Host-session", Value: cookie})
		}
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)
		if !called || rec.Code != 204 {
			t.Fatalf("called=%v status=%d", called, rec.Code)
		}
	}
	check("", false)
	pending := h.client()
	expect(t, pending.do("POST", "/api/v1/admin/sessions", `{"email":"`+ownerEmail+`","password":"`+ownerPassword+`"}`), 200, "")
	check(pending.cookie, false)
	full := h.client()
	full.enroll(ownerEmail, ownerPassword)
	check(full.cookie, true)
	if _, err := h.pool.Exec(t.Context(), `UPDATE identity.admin_users SET session_version=session_version+1`); err != nil {
		t.Fatal(err)
	}
	check(full.cookie, false)
}
