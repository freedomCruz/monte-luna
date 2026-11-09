package domain_test

import (
	"errors"
	"strings"
	"testing"

	"github.com/freedomCruz/monte-luna/backend/internal/catalog/domain"
)

func TestImageUploadValidation(t *testing.T) {
	for _, tt := range []struct {
		name, mime, declared, alt string
		size                      int
		code                      string
	}{
		{"jpeg", "image/jpeg", "image/jpeg", "Bag", 1, ""},
		{"png", "image/png", "image/png", "Bag", 5 << 20, ""},
		{"webp", "image/webp", "image/webp", "Bag", 1, ""},
		{"empty", "image/jpeg", "image/jpeg", "Bag", 0, "validation_failed"},
		{"oversize", "image/png", "image/png", "Bag", (5 << 20) + 1, "image_too_large"},
		{"svg", "image/svg+xml", "image/svg+xml", "Bag", 1, "unsupported_image_type"},
		{"disguised", "text/html", "image/jpeg", "Bag", 1, "unsupported_image_type"},
		{"mismatch", "image/png", "image/jpeg", "Bag", 1, "unsupported_image_type"},
		{"blank_alt", "image/jpeg", "image/jpeg", "  ", 1, "validation_failed"},
	} {
		t.Run(tt.name, func(t *testing.T) {
			in := domain.ImageUpload{ProductID: "01946894-3d9a-7c98-b807-6c84c1762c2f", ProductVersion: 1, AltText: tt.alt, Data: []byte(strings.Repeat("x", tt.size)), DeclaredType: tt.declared}
			ext, err := domain.ValidateImageUpload(in, tt.mime)
			if tt.code == "" {
				if err != nil || ext == "" {
					t.Fatalf("%s %v", ext, err)
				}
				return
			}
			var problem *domain.Error
			if !errors.As(err, &problem) || problem.Code != tt.code {
				t.Fatalf("got %v, want %s", err, tt.code)
			}
		})
	}
}
