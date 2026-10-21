package identity_test

import (
	"testing"
	"time"
)

func TestSessionLifetimesFollowTheModuleClock(t *testing.T) {
	h := newHarness(t)
	owner := h.client()
	secret, _ := owner.enroll(ownerEmail, ownerPassword)
	expect(t, owner.do("DELETE", "/api/v1/admin/sessions/current", ""), 204, "")
	signIn := func(t *testing.T) (*client, time.Time) {
		t.Helper()
		c := h.client()
		c.signIn(ownerEmail, ownerPassword, secret)
		return c, h.now
	}
	h.step("idle timeout is 30 minutes", func(t *testing.T) {
		c, start := signIn(t)
		h.now = start.Add(30 * time.Minute)
		expect(t, c.do("GET", "/api/v1/admin/sessions/current", ""), 200, "")
		h.now = h.now.Add(30*time.Minute + time.Second)
		expect(t, c.do("GET", "/api/v1/admin/sessions/current", ""), 401, "authentication_required")
	})
	h.step("rejected requests do not refresh activity", func(t *testing.T) {
		c, start := signIn(t)
		h.now = start.Add(20 * time.Minute)
		expect(t, c.do("POST", "/api/v1/admin/totp/enroll", ""), 401, "authentication_required")
		h.now = start.Add(30*time.Minute + time.Second)
		expect(t, c.do("GET", "/api/v1/admin/sessions/current", ""), 401, "authentication_required")
	})
	h.step("absolute lifetime is 12 hours even when active", func(t *testing.T) {
		c, start := signIn(t)
		for elapsed := 25 * time.Minute; elapsed < 12*time.Hour; elapsed += 25 * time.Minute {
			h.now = start.Add(elapsed)
			expect(t, c.do("GET", "/api/v1/admin/sessions/current", ""), 200, "")
		}
		h.now = start.Add(12 * time.Hour)
		expect(t, c.do("GET", "/api/v1/admin/sessions/current", ""), 200, "")
		h.now = start.Add(12*time.Hour + time.Second)
		expect(t, c.do("GET", "/api/v1/admin/sessions/current", ""), 401, "authentication_required")
	})
	h.step("pending session lasts 10 minutes", func(t *testing.T) {
		kept := h.client()
		kept.do("POST", "/api/v1/admin/sessions", `{"email":"owner@example.test","password":"`+ownerPassword+`"}`)
		start := h.now
		h.now = start.Add(10 * time.Minute)
		expect(t, kept.do("POST", "/api/v1/admin/sessions/verify", `{"totp_code":"`+h.code(secret)+`"}`), 200, "")
		late := h.client()
		late.do("POST", "/api/v1/admin/sessions", `{"email":"owner@example.test","password":"`+ownerPassword+`"}`)
		start = h.now
		h.now = start.Add(10*time.Minute + time.Second)
		expect(t, late.do("POST", "/api/v1/admin/sessions/verify", `{"totp_code":"`+h.code(secret)+`"}`), 401, "authentication_required")
	})
}
