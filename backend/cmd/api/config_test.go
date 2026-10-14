package main

import "testing"

func TestAPIConfiguration(t *testing.T) {
	for _, tc := range []struct{ name, addr, database, media, want string }{
		{"existing_missing_addr", "", "", "", "API_ADDR is required (for example 127.0.0.1:8080)"},
		{"missing_database", "127.0.0.1:8080", "", "https://media.example/", "DATABASE_URL is required"},
		{"invalid_database", "127.0.0.1:8080", "not-a-connection-string", "https://media.example/", "DATABASE_URL must be a valid PostgreSQL connection string"},
		{"missing_media", "127.0.0.1:8080", "postgres://demo:demo@localhost/demo", "", "MEDIA_BASE_URL is required"},
		{"invalid_media", "127.0.0.1:8080", "postgres://demo:demo@localhost/demo", "relative", "MEDIA_BASE_URL must be an absolute HTTP(S) URL without credentials, query, or fragment"},
		{"valid_existing_addr", "127.0.0.1:8080", "postgres://demo:demo@localhost/demo", "https://media.example/store/", ""},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Setenv("API_ADDR", tc.addr)
			t.Setenv("DATABASE_URL", tc.database)
			t.Setenv("MEDIA_BASE_URL", tc.media)
			cfg, err := loadConfig()
			if tc.want != "" {
				if err == nil || err.Error() != tc.want {
					t.Fatalf("error=%v want %s", err, tc.want)
				}
				return
			}
			if err != nil {
				t.Fatal(err)
			}
			if cfg.addr != tc.addr || cfg.databaseURL != tc.database || cfg.mediaBaseURL != tc.media {
				t.Error("configuration altered explicit environment values")
			}
		})
	}
}
