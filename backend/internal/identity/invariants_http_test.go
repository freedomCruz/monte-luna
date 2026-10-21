package identity_test

import (
	"encoding/base64"
	"testing"
	"time"
)

func assertRecoveryCodes(t *testing.T, codes []any) {
	t.Helper()
	if len(codes) != 10 {
		t.Fatalf("%d recovery codes, want 10", len(codes))
	}
	seen := map[string]bool{}
	for _, value := range codes {
		code, _ := value.(string)
		raw, err := base64.RawURLEncoding.Strict().DecodeString(code)
		if err != nil || len(raw) != 10 || seen[code] {
			t.Fatalf("recovery code does not decode to 10 unique random bytes")
		}
		seen[code] = true
	}
}

func TestRecoveryCodesAreTenCodesOfTenBytes(t *testing.T) {
	h := newHarness(t)
	owner := h.client()
	owner.do("POST", "/api/v1/admin/sessions", `{"email":"owner@example.test","password":"`+ownerPassword+`"}`)
	secret := owner.do("POST", "/api/v1/admin/totp/enroll", "").str("secret")
	h.advance()
	confirmed := owner.do("POST", "/api/v1/admin/totp/confirm", `{"totp_code":"`+h.code(secret)+`"}`)
	expect(t, confirmed, 200, "")
	assertRecoveryCodes(t, confirmed.body["recovery_codes"].([]any))
	h.advance()
	regenerated := owner.do("POST", "/api/v1/admin/recovery-codes/regenerate", `{"current_password":"`+ownerPassword+`","second_factor":{"totp_code":"`+h.code(secret)+`"}}`)
	expect(t, regenerated, 200, "")
	assertRecoveryCodes(t, regenerated.body["recovery_codes"].([]any))
}

func TestExpiredInvitationRecoversThroughOrdinaryReset(t *testing.T) {
	h := newHarness(t)
	owner := h.client()
	owner.enroll(ownerEmail, ownerPassword)
	expect(t, owner.do("POST", "/api/v1/admin/users", `{"email":"late@example.test","display_name":"Late","role":"staff"}`), 201, "")
	_, invitation := h.latestToken("identity.admin_invited")
	h.now = h.now.Add(30 * time.Minute)
	invitee := h.client()
	invitee.ip = "192.0.2.50"
	const password = "late invitee passphrase"
	h.secrets = append(h.secrets, password)
	expect(t, invitee.do("POST", "/api/v1/admin/password-resets/complete", `{"token":"`+invitation+`","new_password":"`+password+`"}`), 422, "invalid_reset_token")
	expect(t, invitee.do("POST", "/api/v1/admin/password-resets", `{"email":"late@example.test"}`), 200, "")
	_, reset := h.latestToken("identity.password_reset_requested")
	expect(t, invitee.do("POST", "/api/v1/admin/password-resets/complete", `{"token":"`+invitation+`","new_password":"`+password+`"}`), 422, "invalid_reset_token")
	expect(t, invitee.do("POST", "/api/v1/admin/password-resets/complete", `{"token":"`+reset+`","new_password":"`+password+`"}`), 200, "")
	if invitee.cookie != "" {
		t.Fatal("reset completion created a session")
	}
	expect(t, invitee.do("GET", "/api/v1/admin/sessions/current", ""), 401, "authentication_required")
	login := invitee.do("POST", "/api/v1/admin/sessions", `{"email":"late@example.test","password":"`+password+`"}`)
	if login.Code != 200 || login.str("next_step") != "enrollment_required" {
		t.Fatalf("recovered invitee must still enroll TOTP: %s", login.Body.String())
	}
	expect(t, invitee.do("GET", "/api/v1/admin/sessions/current", ""), 401, "authentication_required")
}

func TestLockoutLastsExactlyFifteenMinutes(t *testing.T) {
	h := newHarness(t)
	attacker := h.client()
	for range 5 {
		expect(t, attacker.do("POST", "/api/v1/admin/sessions", `{"email":"owner@example.test","password":"wrong password"}`), 401, "invalid_credentials")
	}
	start := h.now
	owner := h.client()
	owner.ip = "192.0.2.60"
	h.now = start.Add(15*time.Minute - time.Second)
	locked := owner.do("POST", "/api/v1/admin/sessions", `{"email":"owner@example.test","password":"`+ownerPassword+`"}`)
	expect(t, locked, 429, "rate_limited")
	if locked.Header().Get("Retry-After") != "1" || owner.cookie != "" {
		t.Fatalf("lockout Retry-After %q or session issued", locked.Header().Get("Retry-After"))
	}
	h.now = start.Add(15 * time.Minute)
	unlocked := owner.do("POST", "/api/v1/admin/sessions", `{"email":"owner@example.test","password":"`+ownerPassword+`"}`)
	if unlocked.Code != 200 || owner.cookie == "" {
		t.Fatalf("lockout outlived 15 minutes: %s", unlocked.Body.String())
	}
}

func TestRoleChangeRevokesLiveSession(t *testing.T) {
	h := newHarness(t)
	owner := h.client()
	owner.enroll(ownerEmail, ownerPassword)
	created := owner.do("POST", "/api/v1/admin/users", `{"email":"promoted@example.test","display_name":"Promoted","role":"staff"}`)
	expect(t, created, 201, "")
	id := created.str("id")
	_, token := h.latestToken("identity.admin_invited")
	staff := h.client()
	staff.ip = "192.0.2.70"
	const password = "promoted staff passphrase"
	h.secrets = append(h.secrets, password)
	expect(t, staff.do("POST", "/api/v1/admin/password-resets/complete", `{"token":"`+token+`","new_password":"`+password+`"}`), 200, "")
	staff.enroll("promoted@example.test", password)
	expect(t, staff.do("GET", "/api/v1/admin/sessions/current", ""), 200, "")
	etag := owner.do("GET", "/api/v1/admin/users/"+id, "").Header().Get("ETag")
	changed := owner.do("PATCH", "/api/v1/admin/users/"+id, `{"role":"owner"}`, header("If-Match", etag))
	expect(t, changed, 200, "")
	if changed.str("role") != "owner" {
		t.Fatalf("role not changed: %s", changed.Body.String())
	}
	expect(t, staff.do("GET", "/api/v1/admin/sessions/current", ""), 401, "authentication_required")
	expect(t, staff.do("GET", "/api/v1/admin/users", ""), 401, "authentication_required")
	expect(t, owner.do("GET", "/api/v1/admin/sessions/current", ""), 200, "")
}
