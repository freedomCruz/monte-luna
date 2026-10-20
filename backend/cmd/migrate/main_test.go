package main

import "testing"

func TestRunModuleAcceptsNotifications(t *testing.T) {
	t.Setenv("DATABASE_URL", "")
	for _, tc := range []struct{ module, want string }{
		{"notifications", "DATABASE_URL is required"},
		{"payments", "DATABASE_URL is required"},
		{"identity", "module must be all, catalog, shipping, orders, payments or notifications"},
	} {
		t.Run(tc.module, func(t *testing.T) {
			if err := runModule(t.Context(), tc.module); err == nil || err.Error() != tc.want {
				t.Fatalf("error=%v want %s", err, tc.want)
			}
		})
	}
}
