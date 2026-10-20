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
