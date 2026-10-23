package identity_test

import (
	"fmt"
	"strings"
	"testing"
)

func TestAuthenticationHTTP(t *testing.T) {
	h := newHarness(t)
	owner := h.client()

	h.step("uniform credential failures", func(t *testing.T) {
		wrong := owner.do("POST", "/api/v1/admin/sessions", `{"email":"owner@example.test","password":"incorrect password"}`)
		unknown := owner.do("POST", "/api/v1/admin/sessions", `{"email":"nobody@example.test","password":"incorrect password"}`)
		expect(t, wrong, 401, "invalid_credentials")
		if wrong.Body.String() != unknown.Body.String() || owner.cookie != "" {
			t.Fatal("credential failure differs by account existence or issued a session")
		}
		expect(t, owner.invalid("POST", "/api/v1/admin/sessions", `{"email":`), 400, "bad_request")
		expect(t, owner.invalid("POST", "/api/v1/admin/sessions", `{"email":"owner@example.test","password":"x","remember":true}`), 422, "validation_failed")
		expect(t, owner.do("POST", "/api/v1/admin/sessions", `{"email":"not-an-email","password":"x"}`), 422, "validation_failed")
	})
	h.step("cross-origin unsafe requests are rejected", func(t *testing.T) {
		for path, body := range map[string]string{
			"/api/v1/admin/sessions":        `{"email":"owner@example.test","password":"` + ownerPassword + `"}`,
			"/api/v1/admin/password-resets": `{"email":"owner@example.test"}`,
		} {
			expect(t, owner.do("POST", path, body, header("Sec-Fetch-Site", "cross-site")), 403, "cross_origin_rejected")
		}
		if owner.cookie != "" || h.count(`SELECT count(*) FROM identity.outbox`) != 0 {
			t.Fatal("rejected cross-origin request had effects")
		}
		expect(t, owner.do("DELETE", "/api/v1/admin/sessions/current", "", header("Origin", "https://evil.test")), 403, "cross_origin_rejected")
	})

	var secret string
	var recovery []string
	h.step("staged enrollment", func(t *testing.T) {
		login := owner.do("POST", "/api/v1/admin/sessions", `{"email":"OWNER@example.test","password":"`+ownerPassword+`"}`)
		expect(t, login, 200, "")
		pending := owner.cookie
		if login.str("next_step") != "enrollment_required" || pending == "" {
			t.Fatalf("pending session not issued: %s", login.Body.String())
		}
		expect(t, owner.do("GET", "/api/v1/admin/sessions/current", ""), 401, "authentication_required")
		expect(t, owner.do("POST", "/api/v1/admin/sessions/verify", `{"totp_code":"123456"}`), 401, "authentication_required")
		enrolled := owner.do("POST", "/api/v1/admin/totp/enroll", "")
		expect(t, enrolled, 200, "")
		secret = enrolled.str("secret")
		if secret == "" || !strings.HasPrefix(enrolled.str("otpauth_uri"), "otpauth://totp/") {
			t.Fatal("enrollment material missing")
		}
		h.advance()
		wrongCode := "000000"
		if h.code(secret) == wrongCode {
			wrongCode = "111111"
		}
		expect(t, owner.do("POST", "/api/v1/admin/totp/confirm", `{"totp_code":"`+wrongCode+`"}`), 401, "invalid_credentials")
		expect(t, owner.invalid("POST", "/api/v1/admin/totp/confirm", `{"totp_code":"12345"}`), 422, "validation_failed")
		confirmed := owner.do("POST", "/api/v1/admin/totp/confirm", `{"totp_code":"`+h.code(secret)+`"}`)
		expect(t, confirmed, 200, "")
		for _, code := range confirmed.body["recovery_codes"].([]any) {
			recovery = append(recovery, code.(string))
		}
		h.secrets = append(h.secrets, recovery...)
		if len(recovery) != 10 || owner.cookie == pending || owner.cookie == "" {
			t.Fatalf("recovery codes %d or session not rotated", len(recovery))
		}
		stale := h.client()
		stale.cookie = pending
		expect(t, stale.do("GET", "/api/v1/admin/sessions/current", ""), 401, "authentication_required")
		current := owner.do("GET", "/api/v1/admin/sessions/current", "")
		expect(t, current, 200, "")
		if current.str("email") != ownerEmail || current.str("role") != "owner" || current.body["totp_confirmed_at"] == nil || current.Header().Get("ETag") == "" {
			t.Fatalf("current admin %s", current.Body.String())
		}
		if strings.Contains(current.Body.String(), "password_hash") || strings.Contains(current.Body.String(), "session_version") {
			t.Fatal("internal credential fields exposed")
		}
		expect(t, owner.do("POST", "/api/v1/admin/totp/enroll", ""), 401, "authentication_required")
	})
	h.step("logout is idempotent and revokes", func(t *testing.T) {
		before := owner.cookie
		out := owner.do("DELETE", "/api/v1/admin/sessions/current", "")
		if out.Code != 204 || owner.cookie != "" {
			t.Fatalf("logout %d cookie retained", out.Code)
		}
		reused := h.client()
		reused.cookie = before
		expect(t, reused.do("GET", "/api/v1/admin/sessions/current", ""), 401, "authentication_required")
		if again := h.client().do("DELETE", "/api/v1/admin/sessions/current", ""); again.Code != 204 {
			t.Fatal("anonymous logout not idempotent")
		}
		if h.count(`SELECT count(*) FROM identity.security_events WHERE event_type='logout'`) != 1 {
			t.Fatal("logout not audited exactly once")
		}
	})
	h.step("second factor with recovery code and TOTP", func(t *testing.T) {
		login := owner.do("POST", "/api/v1/admin/sessions", `{"email":"owner@example.test","password":"`+ownerPassword+`"}`)
		if login.str("next_step") != "totp_required" {
			t.Fatalf("next_step %s", login.Body.String())
		}
		expect(t, owner.do("POST", "/api/v1/admin/totp/enroll", ""), 401, "authentication_required")
		expect(t, owner.invalid("POST", "/api/v1/admin/sessions/verify", `{"totp_code":"123456","recovery_code":"x"}`), 422, "validation_failed")
		verified := owner.do("POST", "/api/v1/admin/sessions/verify", `{"recovery_code":"`+recovery[0]+`"}`)
		expect(t, verified, 200, "")
		if verified.str("email") != ownerEmail {
			t.Fatal("verify did not return the administrator")
		}
		replay := h.client()
		replay.do("POST", "/api/v1/admin/sessions", `{"email":"owner@example.test","password":"`+ownerPassword+`"}`)
		expect(t, replay.do("POST", "/api/v1/admin/sessions/verify", `{"recovery_code":"`+recovery[0]+`"}`), 401, "invalid_credentials")
		h.advance()
		code := h.code(secret)
		expect(t, replay.do("POST", "/api/v1/admin/sessions/verify", `{"totp_code":"`+code+`"}`), 200, "")
		third := h.client()
		third.do("POST", "/api/v1/admin/sessions", `{"email":"owner@example.test","password":"`+ownerPassword+`"}`)
		expect(t, third.do("POST", "/api/v1/admin/sessions/verify", `{"totp_code":"`+code+`"}`), 401, "invalid_credentials")
	})
	h.step("recovery code regeneration", func(t *testing.T) {
		expect(t, owner.do("POST", "/api/v1/admin/recovery-codes/regenerate", `{"current_password":"wrong password","second_factor":{"recovery_code":"`+recovery[1]+`"}}`), 401, "invalid_credentials")
		expect(t, owner.invalid("POST", "/api/v1/admin/recovery-codes/regenerate", `{"current_password":"x"}`), 422, "validation_failed")
		h.advance()
		fresh := owner.do("POST", "/api/v1/admin/recovery-codes/regenerate", `{"current_password":"`+ownerPassword+`","second_factor":{"totp_code":"`+h.code(secret)+`"}}`)
		expect(t, fresh, 200, "")
		codes := fresh.body["recovery_codes"].([]any)
		if len(codes) != 10 {
			t.Fatalf("regenerated %d codes", len(codes))
		}
		stale := h.client()
		stale.do("POST", "/api/v1/admin/sessions", `{"email":"owner@example.test","password":"`+ownerPassword+`"}`)
		expect(t, stale.do("POST", "/api/v1/admin/sessions/verify", `{"recovery_code":"`+recovery[2]+`"}`), 401, "invalid_credentials")
		recovery = nil
		for _, code := range codes {
			recovery = append(recovery, code.(string))
		}
		h.secrets = append(h.secrets, recovery...)
	})
	const changed = "changed owner passphrase"
	h.secrets = append(h.secrets, changed)
	h.step("password change revokes every session", func(t *testing.T) {
		second := h.client()
		second.signIn(ownerEmail, ownerPassword, secret)
		short := owner.do("POST", "/api/v1/admin/password/change", `{"current_password":"`+ownerPassword+`","new_password":"too short","second_factor":{"recovery_code":"`+recovery[0]+`"}}`)
		expect(t, short, 422, "validation_failed")
		if !strings.Contains(short.Body.String(), `"field":"new_password"`) {
			t.Fatal("policy violation lacks a field error")
		}
		expect(t, owner.do("POST", "/api/v1/admin/password/change", `{"current_password":"`+ownerPassword+`","new_password":"`+changed+`","second_factor":{"recovery_code":"`+recovery[0]+`"}}`), 200, "")
		expect(t, owner.do("GET", "/api/v1/admin/sessions/current", ""), 401, "authentication_required")
		expect(t, second.do("GET", "/api/v1/admin/sessions/current", ""), 401, "authentication_required")
		expect(t, h.client().do("POST", "/api/v1/admin/sessions", `{"email":"owner@example.test","password":"`+ownerPassword+`"}`), 401, "invalid_credentials")
		owner.signIn(ownerEmail, changed, secret)
	})
	h.step("password reset without enumeration", func(t *testing.T) {
		anonymous := h.client()
		anonymous.ip = "192.0.2.20"
		before := h.count(`SELECT count(*) FROM identity.outbox WHERE type='identity.password_reset_requested'`)
		missing := anonymous.do("POST", "/api/v1/admin/password-resets", `{"email":"missing@example.test"}`)
		known := anonymous.do("POST", "/api/v1/admin/password-resets", `{"email":"OWNER@example.test"}`)
		expect(t, known, 200, "")
		if missing.Body.String() != known.Body.String() || h.count(`SELECT count(*) FROM identity.outbox WHERE type='identity.password_reset_requested'`) != before+1 {
			t.Fatal("reset response enumerates accounts or event count is wrong")
		}
		if strings.Contains(known.Body.String(), "token") {
			t.Fatal("reset response leaks a token")
		}
		_, token := h.latestToken("identity.password_reset_requested")
		expect(t, anonymous.do("POST", "/api/v1/admin/password-resets/complete", `{"token":"not-a-real-token","new_password":"reset owner passphrase"}`), 422, "invalid_reset_token")
		expect(t, anonymous.do("POST", "/api/v1/admin/password-resets/complete", `{"token":"`+token+`","new_password":"short"}`), 422, "validation_failed")
		const reset = "reset owner passphrase"
		h.secrets = append(h.secrets, reset)
		done := anonymous.do("POST", "/api/v1/admin/password-resets/complete", `{"token":"`+token+`","new_password":"`+reset+`"}`)
		expect(t, done, 200, "")
		if anonymous.cookie != "" {
			t.Fatal("reset completion created a session")
		}
		expect(t, anonymous.do("POST", "/api/v1/admin/password-resets/complete", `{"token":"`+token+`","new_password":"`+reset+` again"}`), 422, "invalid_reset_token")
		expect(t, owner.do("GET", "/api/v1/admin/sessions/current", ""), 401, "authentication_required")
		owner.signIn(ownerEmail, reset, secret)
	})
}

func TestRateLimitingHTTP(t *testing.T) {
	h := newHarness(t)
	h.step("account limit and lockout", func(t *testing.T) {
		c := h.client()
		for i := range 5 {
			expect(t, c.do("POST", "/api/v1/admin/sessions", `{"email":"owner@example.test","password":"wrong password"}`), 401, "invalid_credentials")
			_ = i
		}
		limited := c.do("POST", "/api/v1/admin/sessions", `{"email":"owner@example.test","password":"`+ownerPassword+`"}`)
		expect(t, limited, 429, "rate_limited")
		if limited.Header().Get("Retry-After") == "" || limited.Header().Get("Retry-After") == "0" || c.cookie != "" {
			t.Fatal("rate limit lacks Retry-After or issued a session")
		}
		h.now = h.now.Add(2 * 60e9)
		locked := h.client()
		locked.ip = "192.0.2.30"
		expect(t, locked.do("POST", "/api/v1/admin/sessions", `{"email":"owner@example.test","password":"`+ownerPassword+`"}`), 429, "rate_limited")
		h.now = h.now.Add(15 * 60e9)
		expect(t, locked.do("POST", "/api/v1/admin/sessions", `{"email":"owner@example.test","password":"`+ownerPassword+`"}`), 200, "")
	})
	h.step("ip limit", func(t *testing.T) {
		c := h.client()
		c.ip = "198.51.100.7"
		for i := range 20 {
			expect(t, c.do("POST", "/api/v1/admin/sessions", `{"email":"user`+string(rune('a'+i))+`@example.test","password":"wrong password"}`), 401, "invalid_credentials")
		}
		limited := c.do("POST", "/api/v1/admin/sessions", `{"email":"other@example.test","password":"wrong password"}`)
		expect(t, limited, 429, "rate_limited")
		reset := c.do("POST", "/api/v1/admin/password-resets", `{"email":"other@example.test"}`)
		expect(t, reset, 429, "rate_limited")
		other := h.client()
		other.ip = "198.51.100.8"
		expect(t, other.do("POST", "/api/v1/admin/sessions", `{"email":"other@example.test","password":"wrong password"}`), 401, "invalid_credentials")
	})
	h.step("public peer ignores forged forwarded header", func(t *testing.T) {
		c := h.client()
		c.ip = "198.51.100.50"
		for i := range 20 {
			expect(t, c.do("POST", "/api/v1/admin/sessions", fmt.Sprintf(`{"email":"forged_%d@example.test","password":"wrong password"}`, i), header("X-Forwarded-For", fmt.Sprintf("192.0.2.1, 203.0.113.%d", 1+i))), 401, "invalid_credentials")
		}
		limited := c.do("POST", "/api/v1/admin/sessions", `{"email":"forged_final@example.test","password":"wrong password"}`, header("X-Forwarded-For", "203.0.113.99"))
		expect(t, limited, 429, "rate_limited")

		other := h.client()
		other.ip = "198.51.100.51"
		expect(t, other.do("POST", "/api/v1/admin/sessions", `{"email":"forged_other@example.test","password":"wrong password"}`, header("X-Forwarded-For", "203.0.113.1")), 401, "invalid_credentials")
	})
	h.step("loopback peer trusts last forwarded entry", func(t *testing.T) {
		c := h.client()
		c.ip = "127.0.0.1"
		for i := range 20 {
			expect(t, c.do("POST", "/api/v1/admin/sessions", fmt.Sprintf(`{"email":"loopback_v4_%d@example.test","password":"wrong password"}`, i), header("X-Forwarded-For", "198.51.100.1, 203.0.113.100")), 401, "invalid_credentials")
		}
		limited := c.do("POST", "/api/v1/admin/sessions", `{"email":"loopback_v4_final@example.test","password":"wrong password"}`, header("X-Forwarded-For", "198.51.100.2, 203.0.113.100"))
		expect(t, limited, 429, "rate_limited")

		expect(t, c.do("POST", "/api/v1/admin/sessions", `{"email":"loopback_v4_other@example.test","password":"wrong password"}`, header("X-Forwarded-For", "198.51.100.1, 203.0.113.101")), 401, "invalid_credentials")

		c6 := h.client()
		c6.ip = "::1"
		for i := range 20 {
			expect(t, c6.do("POST", "/api/v1/admin/sessions", fmt.Sprintf(`{"email":"loopback_v6_%d@example.test","password":"wrong password"}`, i), header("X-Forwarded-For", "198.51.100.1"), addHeader("X-Forwarded-For", "198.51.100.2, 203.0.113.110")), 401, "invalid_credentials")
		}
		limited6 := c6.do("POST", "/api/v1/admin/sessions", `{"email":"loopback_v6_final@example.test","password":"wrong password"}`, header("X-Forwarded-For", "198.51.100.1, 203.0.113.110"))
		expect(t, limited6, 429, "rate_limited")

		expect(t, c6.do("POST", "/api/v1/admin/sessions", `{"email":"loopback_v6_other@example.test","password":"wrong password"}`, header("X-Forwarded-For", "198.51.100.1, 203.0.113.111")), 401, "invalid_credentials")
	})
	h.step("private peer trusts last forwarded entry", func(t *testing.T) {
		c10 := h.client()
		c10.ip = "10.0.1.25"
		for i := range 20 {
			expect(t, c10.do("POST", "/api/v1/admin/sessions", fmt.Sprintf(`{"email":"priv10_%d@example.test","password":"wrong password"}`, i), header("X-Forwarded-For", "70.41.3.18, 203.0.113.120")), 401, "invalid_credentials")
		}
		limited10 := c10.do("POST", "/api/v1/admin/sessions", `{"email":"priv10_final@example.test","password":"wrong password"}`, header("X-Forwarded-For", "70.41.3.18, 203.0.113.120"))
		expect(t, limited10, 429, "rate_limited")

		expect(t, c10.do("POST", "/api/v1/admin/sessions", `{"email":"priv10_other@example.test","password":"wrong password"}`, header("X-Forwarded-For", "70.41.3.18, 203.0.113.121")), 401, "invalid_credentials")

		c192 := h.client()
		c192.ip = "192.168.1.50"
		for i := range 20 {
			expect(t, c192.do("POST", "/api/v1/admin/sessions", fmt.Sprintf(`{"email":"priv192_%d@example.test","password":"wrong password"}`, i), header("X-Forwarded-For", "70.41.3.18"), addHeader("X-Forwarded-For", "198.51.100.5, 203.0.113.130")), 401, "invalid_credentials")
		}
		limited192 := c192.do("POST", "/api/v1/admin/sessions", `{"email":"priv192_final@example.test","password":"wrong password"}`, header("X-Forwarded-For", "70.41.3.18, 203.0.113.130"))
		expect(t, limited192, 429, "rate_limited")

		expect(t, c192.do("POST", "/api/v1/admin/sessions", `{"email":"priv192_other@example.test","password":"wrong password"}`, header("X-Forwarded-For", "70.41.3.18, 203.0.113.131")), 401, "invalid_credentials")
	})
	h.step("malformed forwarded header falls back to private peer", func(t *testing.T) {
		c := h.client()
		c.ip = "10.0.2.75"
		for i := range 20 {
			expect(t, c.do("POST", "/api/v1/admin/sessions", fmt.Sprintf(`{"email":"malformed_%d@example.test","password":"wrong password"}`, i), header("X-Forwarded-For", "not-an-ip")), 401, "invalid_credentials")
		}
		limited := c.do("POST", "/api/v1/admin/sessions", `{"email":"malformed_final@example.test","password":"wrong password"}`, header("X-Forwarded-For", "also-malformed"))
		expect(t, limited, 429, "rate_limited")

		expect(t, c.do("POST", "/api/v1/admin/sessions", `{"email":"malformed_no_header@example.test","password":"wrong password"}`), 429, "rate_limited")

		other := h.client()
		other.ip = "10.0.2.76"
		expect(t, other.do("POST", "/api/v1/admin/sessions", `{"email":"malformed_other@example.test","password":"wrong password"}`, header("X-Forwarded-For", "not-an-ip")), 401, "invalid_credentials")
	})
	h.step("ipv4-mapped ipv6 peers and headers", func(t *testing.T) {
		cLoop := h.client()
		cLoop.ip = "::ffff:127.0.0.1"
		for i := range 20 {
			expect(t, cLoop.do("POST", "/api/v1/admin/sessions", fmt.Sprintf(`{"email":"mapped_loop_%d@example.test","password":"wrong password"}`, i), header("X-Forwarded-For", "198.51.100.1, 203.0.113.140")), 401, "invalid_credentials")
		}
		limitedLoop := cLoop.do("POST", "/api/v1/admin/sessions", `{"email":"mapped_loop_final@example.test","password":"wrong password"}`, header("X-Forwarded-For", "203.0.113.140"))
		expect(t, limitedLoop, 429, "rate_limited")
		expect(t, cLoop.do("POST", "/api/v1/admin/sessions", `{"email":"mapped_loop_other@example.test","password":"wrong password"}`, header("X-Forwarded-For", "203.0.113.141")), 401, "invalid_credentials")

		cPriv := h.client()
		cPriv.ip = "::ffff:10.0.3.1"
		for i := range 20 {
			expect(t, cPriv.do("POST", "/api/v1/admin/sessions", fmt.Sprintf(`{"email":"mapped_priv_%d@example.test","password":"wrong password"}`, i), header("X-Forwarded-For", "203.0.113.150")), 401, "invalid_credentials")
		}
		limitedPriv := cPriv.do("POST", "/api/v1/admin/sessions", `{"email":"mapped_priv_final@example.test","password":"wrong password"}`, header("X-Forwarded-For", "203.0.113.150"))
		expect(t, limitedPriv, 429, "rate_limited")
		expect(t, cPriv.do("POST", "/api/v1/admin/sessions", `{"email":"mapped_priv_other@example.test","password":"wrong password"}`, header("X-Forwarded-For", "203.0.113.151")), 401, "invalid_credentials")

		cPub := h.client()
		cPub.ip = "::ffff:198.51.100.90"
		for i := range 20 {
			expect(t, cPub.do("POST", "/api/v1/admin/sessions", fmt.Sprintf(`{"email":"mapped_pub_%d@example.test","password":"wrong password"}`, i), header("X-Forwarded-For", fmt.Sprintf("203.0.113.%d", 1+i))), 401, "invalid_credentials")
		}
		limitedPub := cPub.do("POST", "/api/v1/admin/sessions", `{"email":"mapped_pub_final@example.test","password":"wrong password"}`, header("X-Forwarded-For", "203.0.113.99"))
		expect(t, limitedPub, 429, "rate_limited")

		cMapForward := h.client()
		cMapForward.ip = "127.0.0.1"
		for i := range 20 {
			expect(t, cMapForward.do("POST", "/api/v1/admin/sessions", fmt.Sprintf(`{"email":"map_fwd_%d@example.test","password":"wrong password"}`, i), header("X-Forwarded-For", "::ffff:203.0.113.160")), 401, "invalid_credentials")
		}
		limitedMapForward := cMapForward.do("POST", "/api/v1/admin/sessions", `{"email":"map_fwd_final@example.test","password":"wrong password"}`, header("X-Forwarded-For", "203.0.113.160"))
		expect(t, limitedMapForward, 429, "rate_limited")
	})
}
