package identity_test

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestUnsupportedMethodsStayNoStore(t *testing.T) {
	h := newHarness(t)
	for _, tc := range []struct{ method, path, allow string }{
		{"PUT", "/api/v1/admin/sessions", "POST"},
		{"GET", "/api/v1/admin/sessions/verify", "POST"},
		{"POST", "/api/v1/admin/sessions/current", "DELETE, GET, HEAD"},
		{"GET", "/api/v1/admin/totp/enroll", "POST"},
		{"DELETE", "/api/v1/admin/totp/confirm", "POST"},
		{"GET", "/api/v1/admin/password-resets", "POST"},
		{"PATCH", "/api/v1/admin/password-resets/complete", "POST"},
		{"GET", "/api/v1/admin/password/change", "POST"},
		{"GET", "/api/v1/admin/recovery-codes/regenerate", "POST"},
		{"DELETE", "/api/v1/admin/users", "GET, HEAD, POST"},
		{"DELETE", "/api/v1/admin/users/0199c4e2-7a1b-7c3d-9e0f-1a2b3c4d5e6f", "GET, HEAD, PATCH"},
		{"GET", "/api/v1/admin/users/0199c4e2-7a1b-7c3d-9e0f-1a2b3c4d5e6f/totp/reset", "POST"},
	} {
		t.Run(tc.method+" "+tc.path, func(t *testing.T) {
			rec := httptest.NewRecorder()
			h.mux.ServeHTTP(rec, httptest.NewRequest(tc.method, tc.path, nil))
			if rec.Code != http.StatusMethodNotAllowed || rec.Header().Get("Allow") != tc.allow {
				t.Fatalf("status %d allow %q", rec.Code, rec.Header().Get("Allow"))
			}
			if values := rec.Header().Values("Cache-Control"); len(values) != 1 || values[0] != "no-store" {
				t.Fatalf("Cache-Control %q", values)
			}
		})
	}
}
