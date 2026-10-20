package identity_test

import (
	"strings"
	"testing"
)

func TestAdminManagementHTTP(t *testing.T) {
	h := newHarness(t)
	pending := h.client()
	pending.do("POST", "/api/v1/admin/sessions", `{"email":"owner@example.test","password":"`+ownerPassword+`"}`)
	expect(t, pending.do("GET", "/api/v1/admin/users", ""), 401, "authentication_required")
	expect(t, pending.do("POST", "/api/v1/admin/users", `{"email":"x@example.test","display_name":"X","role":"staff"}`), 401, "authentication_required")
	owner := h.client()
	ownerSecret, ownerCodes := owner.enroll(ownerEmail, ownerPassword)
	ownerID := owner.do("GET", "/api/v1/admin/sessions/current", "").str("id")

	var staffID, staffETag string
	h.step("owner invites staff atomically", func(t *testing.T) {
		expect(t, owner.invalid("POST", "/api/v1/admin/users", `{"email":"staff@example.test","display_name":"Staff","role":"staff","password":"chosen by owner"}`), 422, "validation_failed")
		expect(t, owner.invalid("POST", "/api/v1/admin/users", `{"email":"staff@example.test","display_name":"Staff","role":"root"}`), 422, "validation_failed")
		if h.count(`SELECT count(*) FROM identity.outbox`) != 0 {
			t.Fatal("rejected creation published an event")
		}
		created := owner.do("POST", "/api/v1/admin/users", `{"email":"Staff@Example.test","display_name":"Staff","role":"staff"}`)
		expect(t, created, 201, "")
		staffID = created.str("id")
		staffETag = created.Header().Get("ETag")
		if created.Header().Get("Location") != "/api/v1/admin/users/"+staffID || staffETag != `"1"` || created.str("email") != "staff@example.test" || created.body["totp_confirmed_at"] != nil {
			t.Fatalf("creation response %v %s", created.Header(), created.Body.String())
		}
		if strings.Contains(created.Body.String(), "token") || strings.Contains(created.Body.String(), "password_hash") {
			t.Fatal("creation leaks secrets")
		}
		expect(t, owner.do("POST", "/api/v1/admin/users", `{"email":"staff@example.test","display_name":"Again","role":"owner"}`), 409, "email_conflict")
		if h.count(`SELECT count(*) FROM identity.outbox WHERE type='identity.admin_invited'`) != 1 {
			t.Fatal("invitation not queued exactly once")
		}
	})

	staff := h.client()
	staff.ip = "192.0.2.40"
	const staffPassword = "staff invitation passphrase"
	h.secrets = append(h.secrets, staffPassword)
	var staffSecret string
	h.step("invitation completes through the shared reset endpoint", func(t *testing.T) {
		admin, token := h.latestToken("identity.admin_invited")
		if admin != staffID {
			t.Fatal("invitation targets another administrator")
		}
		expect(t, staff.do("POST", "/api/v1/admin/password-resets/complete", `{"token":"`+token+`","new_password":"`+staffPassword+`"}`), 200, "")
		if staff.cookie != "" {
			t.Fatal("invitation completion created a session")
		}
		staffSecret, _ = staff.enroll("staff@example.test", staffPassword)
	})
	h.step("staff is limited to its own identity", func(t *testing.T) {
		expect(t, staff.do("GET", "/api/v1/admin/sessions/current", ""), 200, "")
		expect(t, staff.do("GET", "/api/v1/admin/users", ""), 403, "forbidden")
		expect(t, staff.do("GET", "/api/v1/admin/users/"+ownerID, ""), 403, "forbidden")
		expect(t, staff.do("POST", "/api/v1/admin/users", `{"email":"x@example.test","display_name":"X","role":"staff"}`), 403, "forbidden")
		expect(t, staff.do("PATCH", "/api/v1/admin/users/"+ownerID, `{"display_name":"Hijack"}`, header("If-Match", `"1"`)), 403, "forbidden")
		h.advance()
		expect(t, staff.do("POST", "/api/v1/admin/users/"+ownerID+"/totp/reset", `{"current_password":"`+staffPassword+`","second_factor":{"totp_code":"`+h.code(staffSecret)+`"}}`, header("If-Match", `"1"`)), 403, "forbidden")
	})
	h.step("cursor pagination", func(t *testing.T) {
		first := owner.do("GET", "/api/v1/admin/users?limit=1", "")
		expect(t, first, 200, "")
		cursor, _ := first.body["next_cursor"].(string)
		if len(first.body["items"].([]any)) != 1 || cursor == "" {
			t.Fatalf("first page %s", first.Body.String())
		}
		second := owner.do("GET", "/api/v1/admin/users?limit=1&cursor="+cursor, "")
		expect(t, second, 200, "")
		if len(second.body["items"].([]any)) != 1 || second.body["next_cursor"] != nil || second.body["items"].([]any)[0].(map[string]any)["id"] == first.body["items"].([]any)[0].(map[string]any)["id"] {
			t.Fatalf("second page %s", second.Body.String())
		}
		all := owner.do("GET", "/api/v1/admin/users", "")
		if len(all.body["items"].([]any)) != 2 || all.body["next_cursor"] != nil {
			t.Fatal("default page incomplete")
		}
		expect(t, owner.do("GET", "/api/v1/admin/users?cursor=forged", ""), 400, "bad_request")
		expect(t, owner.invalid("GET", "/api/v1/admin/users?limit=0", ""), 400, "bad_request")
		expect(t, owner.invalid("GET", "/api/v1/admin/users?limit=101", ""), 400, "bad_request")
	})
	h.step("read and optimistic update", func(t *testing.T) {
		read := owner.do("GET", "/api/v1/admin/users/"+staffID, "")
		expect(t, read, 200, "")
		staffETag = read.Header().Get("ETag")
		if staffETag != `"2"` || read.body["totp_confirmed_at"] == nil {
			t.Fatalf("read %v %s", read.Header(), read.Body.String())
		}
		expect(t, owner.do("GET", "/api/v1/admin/users/0199c4e2-7a1b-7c3d-9e0f-000000000000", ""), 404, "admin_user_not_found")
		expect(t, owner.do("GET", "/api/v1/admin/users/not-a-uuid", ""), 404, "admin_user_not_found")
		expect(t, owner.invalid("PATCH", "/api/v1/admin/users/"+staffID, `{"display_name":"Renamed"}`), 412, "version_conflict")
		expect(t, owner.do("PATCH", "/api/v1/admin/users/"+staffID, `{"display_name":"Renamed"}`, header("If-Match", `"9"`)), 412, "version_conflict")
		expect(t, owner.invalid("PATCH", "/api/v1/admin/users/"+staffID, `{"status":null}`, header("If-Match", staffETag)), 422, "validation_failed")
		expect(t, owner.invalid("PATCH", "/api/v1/admin/users/"+staffID, `{}`, header("If-Match", staffETag)), 422, "validation_failed")
		expect(t, owner.do("PATCH", "/api/v1/admin/users/"+staffID, `{"email":"owner@example.test"}`, header("If-Match", staffETag)), 409, "email_conflict")
		renamed := owner.do("PATCH", "/api/v1/admin/users/"+staffID, `{"display_name":"Renamed"}`, header("If-Match", staffETag))
		expect(t, renamed, 200, "")
		if renamed.str("display_name") != "Renamed" || renamed.Header().Get("ETag") != `"3"` {
			t.Fatalf("update %v %s", renamed.Header(), renamed.Body.String())
		}
		staffETag = renamed.Header().Get("ETag")
		expect(t, staff.do("GET", "/api/v1/admin/sessions/current", ""), 200, "")
		ownerETag := owner.do("GET", "/api/v1/admin/users/"+ownerID, "").Header().Get("ETag")
		expect(t, owner.do("PATCH", "/api/v1/admin/users/"+ownerID, `{"role":"staff"}`, header("If-Match", ownerETag)), 409, "last_active_owner")
		expect(t, owner.do("PATCH", "/api/v1/admin/users/"+ownerID, `{"status":"disabled"}`, header("If-Match", ownerETag)), 409, "last_active_owner")
		if owner.do("GET", "/api/v1/admin/users/"+ownerID, "").Header().Get("ETag") != ownerETag {
			t.Fatal("rejected owner change modified the record")
		}
	})
	h.step("owner resets another administrator's 2FA", func(t *testing.T) {
		ownerETag := owner.do("GET", "/api/v1/admin/users/"+ownerID, "").Header().Get("ETag")
		h.advance()
		expect(t, owner.do("POST", "/api/v1/admin/users/"+ownerID+"/totp/reset", `{"current_password":"`+ownerPassword+`","second_factor":{"totp_code":"`+h.code(ownerSecret)+`"}}`, header("If-Match", ownerETag)), 403, "forbidden")
		expect(t, owner.do("POST", "/api/v1/admin/users/"+staffID+"/totp/reset", `{"current_password":"wrong password","second_factor":{"recovery_code":"`+ownerCodes[0]+`"}}`, header("If-Match", staffETag)), 401, "invalid_credentials")
		expect(t, owner.do("POST", "/api/v1/admin/users/"+staffID+"/totp/reset", `{"current_password":"`+ownerPassword+`","second_factor":{"recovery_code":"`+ownerCodes[0]+`"}}`, header("If-Match", `"1"`)), 412, "version_conflict")
		reset := owner.do("POST", "/api/v1/admin/users/"+staffID+"/totp/reset", `{"current_password":"`+ownerPassword+`","second_factor":{"recovery_code":"`+ownerCodes[0]+`"}}`, header("If-Match", staffETag))
		expect(t, reset, 200, "")
		if reset.body["totp_confirmed_at"] != nil || reset.Header().Get("ETag") != `"4"` {
			t.Fatalf("reset %v %s", reset.Header(), reset.Body.String())
		}
		staffETag = reset.Header().Get("ETag")
		expect(t, staff.do("GET", "/api/v1/admin/sessions/current", ""), 401, "authentication_required")
		again := h.client()
		again.ip = "192.0.2.41"
		login := again.do("POST", "/api/v1/admin/sessions", `{"email":"staff@example.test","password":"`+staffPassword+`"}`)
		if login.str("next_step") != "enrollment_required" {
			t.Fatalf("reset did not force fresh enrollment: %s", login.Body.String())
		}
	})
	h.step("disabling revokes and blocks login", func(t *testing.T) {
		second := h.client()
		second.ip = "192.0.2.42"
		staffSecret, _ = second.enroll("staff@example.test", staffPassword)
		staffETag = owner.do("GET", "/api/v1/admin/users/"+staffID, "").Header().Get("ETag")
		disabled := owner.do("PATCH", "/api/v1/admin/users/"+staffID, `{"status":"disabled"}`, header("If-Match", staffETag))
		expect(t, disabled, 200, "")
		expect(t, second.do("GET", "/api/v1/admin/sessions/current", ""), 401, "authentication_required")
		third := h.client()
		third.ip = "192.0.2.43"
		expect(t, third.do("POST", "/api/v1/admin/sessions", `{"email":"staff@example.test","password":"`+staffPassword+`"}`), 401, "invalid_credentials")
		if h.count(`SELECT count(*) FROM identity.security_events WHERE event_type IN ('user_created','user_disabled','totp_reset')`) != 4 {
			t.Fatal("lifecycle events not audited")
		}
	})
}
