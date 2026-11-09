package identity_test

import "testing"

func TestBatchNamePublicPort(t *testing.T) {
	h := newHarness(t)
	var id string
	if err := h.pool.QueryRow(t.Context(), `SELECT id::text FROM identity.admin_users WHERE email=$1`, ownerEmail).Scan(&id); err != nil {
		t.Fatal(err)
	}
	names, err := h.module.AdminNames(t.Context(), []string{id, "01946894-3d9a-7c98-b807-6c84c1762c39"})
	if err != nil || len(names) != 1 || names[id] != "Owner" {
		t.Fatalf("names %+v %v", names, err)
	}
	if _, err := h.pool.Exec(t.Context(), `UPDATE identity.admin_users SET display_name='Current Name',status='disabled' WHERE id=$1`, id); err != nil {
		t.Fatal(err)
	}
	names, err = h.module.AdminNames(t.Context(), []string{id})
	if err != nil || names[id] != "Current Name" {
		t.Fatalf("historical names %+v %v", names, err)
	}
	if _, err := h.module.AdminNames(t.Context(), make([]string, 101)); err == nil {
		t.Fatal("unbounded lookup")
	}
}
