package identity_test

import "testing"

func TestCleanupRemovesExpiredSessionsAndOldSecurityEvents(t *testing.T) {
	h := newHarness(t)
	for _, statement := range []string{
		`INSERT INTO identity.sessions(token,data,expiry) VALUES ('expired-fixture','\x00',now()-interval '1 hour'),('live-fixture','\x00',now()+interval '1 hour')`,
		`INSERT INTO identity.security_events(event_type,created_at) VALUES ('logout',now()-interval '13 months'),('logout',now()-interval '11 months')`,
	} {
		if _, err := h.pool.Exec(t.Context(), statement); err != nil {
			t.Fatal(err)
		}
	}
	events := h.count(`SELECT count(*) FROM identity.security_events`)
	if err := h.module.Cleanup(t.Context()); err != nil {
		t.Fatal(err)
	}
	if h.count(`SELECT count(*) FROM identity.sessions WHERE token IN ('expired-fixture','live-fixture')`) != 1 || h.count(`SELECT count(*) FROM identity.sessions WHERE token='live-fixture'`) != 1 {
		t.Fatal("expired session cleanup incorrect")
	}
	if h.count(`SELECT count(*) FROM identity.security_events`) != events-1 || h.count(`SELECT count(*) FROM identity.security_events WHERE created_at < now()-interval '1 year'`) != 0 {
		t.Fatal("security event retention incorrect")
	}
}

func TestCleanupRemovesPasswordTokensSevenDaysAfterExpiryOrConsumption(t *testing.T) {
	h := newHarness(t)
	insert := func(label string, expires, used string) {
		t.Helper()
		usedValue := "NULL"
		if used != "" {
			usedValue = "$2::timestamptz + interval '" + used + "'"
		}
		// The module clock (h.now) is the retention reference.
		if _, err := h.pool.Exec(t.Context(), `INSERT INTO identity.password_reset_tokens(admin_user_id,token_hash,created_at,expires_at,used_at)
SELECT id, encode(sha256($1::bytea),'hex'), $2::timestamptz + interval '`+expires+`' - interval '30 minutes', $2::timestamptz + interval '`+expires+`', `+usedValue+`
FROM identity.admin_users WHERE email='owner@example.test'`, label, h.now); err != nil {
			t.Fatal(err)
		}
	}
	insert("live", "20 minutes", "")
	insert("expired within window", "-6 days", "")
	insert("expired exactly seven days", "-7 days", "")
	insert("expired beyond window", "-7 days -1 second", "")
	insert("consumed within window", "-1 day", "-6 days")
	insert("consumed exactly seven days", "-1 day", "-7 days")
	insert("consumed beyond window", "20 minutes", "-8 days")
	if _, err := h.pool.Exec(t.Context(), `INSERT INTO identity.password_reset_tokens(admin_user_id,token_hash,created_at,expires_at,used_at)
SELECT u.id, encode(sha256(('bulk-'||g)::bytea),'hex'), $1::timestamptz - interval '40 days', $1::timestamptz - interval '30 days', NULL
FROM identity.admin_users u, generate_series(1, 1000) g WHERE u.email='owner@example.test'`, h.now); err != nil {
		t.Fatal(err)
	}
	if _, err := h.pool.Exec(t.Context(), `INSERT INTO identity.sessions(token,data,expiry) VALUES ('expired-fixture','\x00',now()-interval '1 hour'),('live-fixture','\x00',now()+interval '1 hour')`); err != nil {
		t.Fatal(err)
	}
	if _, err := h.pool.Exec(t.Context(), `INSERT INTO identity.security_events(event_type,created_at) VALUES ('logout',now()-interval '13 months'),('logout',now()-interval '11 months')`); err != nil {
		t.Fatal(err)
	}
	events := h.count(`SELECT count(*) FROM identity.security_events`)
	if err := h.module.Cleanup(t.Context()); err != nil {
		t.Fatal(err)
	}
	// 1002 rows are past retention; one run deletes at most one batch of 1000.
	if got := h.count(`SELECT count(*) FROM identity.password_reset_tokens`); got != 1007-1000 {
		t.Fatalf("first run left %d tokens", got)
	}
	if h.count(`SELECT count(*) FROM identity.sessions WHERE token='expired-fixture'`) != 0 || h.count(`SELECT count(*) FROM identity.sessions WHERE token='live-fixture'`) != 1 || h.count(`SELECT count(*) FROM identity.security_events`) != events-1 {
		t.Fatal("session or security event cleanup changed")
	}
	for range 2 {
		if err := h.module.Cleanup(t.Context()); err != nil {
			t.Fatal(err)
		}
	}
	remaining := map[string]bool{}
	rows, err := h.pool.Query(t.Context(), `SELECT token_hash FROM identity.password_reset_tokens`)
	if err != nil {
		t.Fatal(err)
	}
	for rows.Next() {
		var hash string
		if err := rows.Scan(&hash); err != nil {
			t.Fatal(err)
		}
		remaining[hash] = true
	}
	rows.Close()
	for label, kept := range map[string]bool{"live": true, "expired within window": true, "expired exactly seven days": true, "expired beyond window": false, "consumed within window": true, "consumed exactly seven days": true, "consumed beyond window": false} {
		var hash string
		if err := h.pool.QueryRow(t.Context(), `SELECT encode(sha256($1::bytea),'hex')`, label).Scan(&hash); err != nil {
			t.Fatal(err)
		}
		if remaining[hash] != kept {
			t.Fatalf("%s kept=%v want %v", label, remaining[hash], kept)
		}
	}
	if len(remaining) != 5 {
		t.Fatalf("%d tokens remain, want 5", len(remaining))
	}
}
