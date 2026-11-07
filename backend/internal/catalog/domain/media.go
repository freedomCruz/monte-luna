package domain

import (
	"context"
	"errors"
	"strings"

	"github.com/google/uuid"
)

const MaxImageBytes = 5 << 20

var ErrMediaUnavailable = errors.New("media unavailable")

type ImageUpload struct {
	ProductID      string
	ProductVersion int32
	VariantID      *string
	AltText        string
	Position       int32
	Data           []byte
	DeclaredType   string
}

type AdminImage struct {
	ID             string  `json:"id"`
	ProductID      string  `json:"product_id"`
	VariantID      *string `json:"variant_id"`
	URL            string  `json:"url"`
	AltText        string  `json:"alt_text"`
	Position       int32   `json:"position"`
	Version        int32   `json:"version"`
	ProductVersion int32   `json:"-"`
	StorageKey     string  `json:"-"`
}

type ImageReservation struct {
	ID, ProductID, StorageKey string
}

type MediaResolverPort interface {
	Resolve(context.Context, string) (string, error)
}

type ImageRepository interface {
	CheckImageTarget(context.Context, ImageUpload) error
	ReserveImage(context.Context, ImageReservation) error
	AttachImage(context.Context, ImageReservation, ImageUpload) (AdminImage, error)
	// DiscardImage locks a durable reservation: a committed attachment has removed
	// it, so an ambiguous commit must never delete an image that actually committed.
	DiscardImage(context.Context, string, func(context.Context, string) error) error
	AdminImage(context.Context, string, string) (AdminImage, error)
}

func ValidAdminID(id string) bool {
	parsed, err := uuid.Parse(id)
	return err == nil && parsed.Version() == 7 && parsed.String() == id
}

func ValidateImageUpload(in ImageUpload, detected string) (string, error) {
	invalid := func(field string) (string, error) {
		return "", &Error{Status: 422, Code: "validation_failed", Fields: []FieldError{{Field: field, Code: "invalid_parameter", Message: "This field is required or invalid."}}}
	}
	if !ValidAdminID(in.ProductID) || in.ProductVersion < 1 {
		return invalid("product_id")
	}
	if in.VariantID != nil && !ValidAdminID(*in.VariantID) {
		return invalid("variant_id")
	}
	if strings.TrimSpace(in.AltText) == "" {
		return invalid("alt_text")
	}
	if len(in.Data) == 0 {
		return invalid("file")
	}
	if len(in.Data) > MaxImageBytes {
		return "", &Error{Status: 413, Code: "image_too_large"}
	}
	extensions := map[string]string{"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp"}
	ext := extensions[detected]
	if ext == "" || detected != in.DeclaredType {
		return "", &Error{Status: 415, Code: "unsupported_image_type"}
	}
	return ext, nil
}
