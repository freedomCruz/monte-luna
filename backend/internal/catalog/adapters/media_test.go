package adapters_test

import (
	"github.com/freedomCruz/monte-luna/backend/internal/catalog/adapters"
	"testing"
)

func TestMediaPrefix(t *testing.T) {
	for _, tc := range []struct {
		base, key, want string
		invalid         bool
	}{
		{"https://media.example/store/", "demo/a b.jpg", "https://media.example/store/demo/a%20b.jpg", false},
		{"http://localhost:9000/bucket", "demo/a.jpg", "http://localhost:9000/bucket/demo/a.jpg", false},
		{"https://media.example/", "../escape.jpg", "", true},
		{"https://media.example/", "/escape.jpg", "", true},
		{"https://media.example/", "https://other.example/image.jpg", "", true},
	} {
		t.Run(tc.key, func(t *testing.T) {
			media, err := adapters.NewMedia(tc.base)
			if err != nil {
				t.Fatal(err)
			}
			got, err := media.Resolve(t.Context(), tc.key)
			if tc.invalid {
				if err == nil {
					t.Error("non-relative key accepted")
				}
				return
			}
			if err != nil || got != tc.want {
				t.Fatalf("URL/error=%s/%v want %s", got, err, tc.want)
			}
		})
	}
	for _, base := range []string{"", "relative", "ftp://example.com", "https://user:password@example.com", "https://example.com/?token=secret", "https://example.com/#fragment"} {
		if _, err := adapters.NewMedia(base); err == nil {
			t.Errorf("invalid base accepted: %q", base)
		}
	}
}
