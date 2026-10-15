// Package app orchestrates read-only catalog use cases through domain ports.
package app

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"slices"
	"time"

	"github.com/freedomCruz/monte-luna/backend/internal/catalog/domain"
)

type Service struct {
	repository domain.Repository
	media      domain.MediaStorePort
}

func NewService(repository domain.Repository, media domain.MediaStorePort) *Service {
	return &Service{repository: repository, media: media}
}
func validation(field string) *domain.Error {
	return &domain.Error{Status: 422, Code: "validation_failed", Fields: []domain.FieldError{{Field: field, Code: "invalid_parameter", Message: "Invalid parameter value."}}}
}
func ValidSlug(slug string) bool {
	if slug == "" || slug[0] == '-' || slug[len(slug)-1] == '-' {
		return false
	}
	previous := false
	for _, c := range slug {
		if c == '-' {
			if previous {
				return false
			}
			previous = true
			continue
		}
		previous = false
		if (c < 'a' || c > 'z') && (c < '0' || c > '9') {
			return false
		}
	}
	return true
}
func normalize(r domain.Request) (domain.Request, error) {
	if r.Limit < 1 || r.Limit > 100 {
		return r, validation("limit")
	}
	if r.Kind == domain.ProductDetail || r.Kind == domain.OriginDetail || r.Kind == domain.OriginProducts {
		if !ValidSlug(r.Slug) {
			return r, validation("slug")
		}
	}
	defaultSort := "-created_at"
	switch r.Kind {
	case domain.Categories:
		defaultSort = "position"
	case domain.Origins, domain.OriginDetail:
		defaultSort = "name"
	case domain.Availabilities:
		defaultSort = "slug"
	}
	if r.Sort == "" {
		r.Sort = defaultSort
	}
	if r.Sort != defaultSort {
		return r, validation("sort")
	}
	for _, filter := range []struct {
		name   string
		values *[]string
	}{{"category", &r.Categories}, {"product_type", &r.ProductTypes}, {"product_slug", &r.ProductSlugs}} {
		values := slices.Clone(*filter.values)
		slices.Sort(values)
		for i, value := range values {
			if !ValidSlug(value) || (i > 0 && value == values[i-1]) {
				return r, validation(filter.name)
			}
		}
		*filter.values = values
	}
	if r.Kind == domain.Availabilities && (len(r.ProductSlugs) == 0 || len(r.ProductSlugs) > 100) {
		return r, validation("product_slug")
	}
	return r, nil
}

type cursor struct {
	Version int        `json:"version"`
	Binding string     `json:"binding"`
	After   domain.Key `json:"after"`
}

func binding(request domain.Request) string {
	request.Cursor = ""
	encoded, _ := json.Marshal(request)
	sum := sha256.Sum256(encoded)
	return hex.EncodeToString(sum[:])
}
func decodeCursor(request domain.Request) (domain.Key, error) {
	bad := &domain.Error{Status: 400, Code: "invalid_cursor"}
	if len(request.Cursor) > 8192 {
		return domain.Key{}, bad
	}
	data, err := base64.RawURLEncoding.DecodeString(request.Cursor)
	if err != nil {
		return domain.Key{}, bad
	}
	var c cursor
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&c); err != nil {
		return domain.Key{}, bad
	}
	if decoder.Decode(new(any)) != io.EOF {
		return domain.Key{}, bad
	}
	if c.Version != 1 || c.Binding != binding(request) || !ValidSlug(c.After.Slug) {
		return domain.Key{}, bad
	}
	switch request.Kind {
	case domain.Products, domain.OriginProducts:
		if c.After.CreatedAt == nil || c.After.CreatedAt.IsZero() {
			return domain.Key{}, bad
		}
	case domain.Categories:
		if c.After.Position == nil {
			return domain.Key{}, bad
		}
	case domain.Origins:
		if c.After.Name == nil {
			return domain.Key{}, bad
		}
	}
	return c.After, nil
}
func makePage[T any](items []T, request domain.Request, key func(T) domain.Key) (domain.Page[T], error) {
	if items == nil {
		items = make([]T, 0)
	}
	page := domain.Page[T]{Items: items}
	if len(items) > request.Limit {
		page.Items = items[:request.Limit]
		c := cursor{Version: 1, Binding: binding(request), After: key(page.Items[len(page.Items)-1])}
		encoded, err := json.Marshal(c)
		if err != nil {
			return page, fmt.Errorf("encode cursor: %w", err)
		}
		token := base64.RawURLEncoding.EncodeToString(encoded)
		page.NextCursor = &token
	}
	return page, nil
}

func (s *Service) Read(ctx context.Context, request domain.Request) (any, error) {
	request, err := normalize(request)
	if err != nil {
		return nil, err
	}
	query := domain.Query{Request: request}
	query.Limit = request.Limit + 1
	if request.Cursor != "" {
		query.After, err = decodeCursor(request)
		if err != nil {
			return nil, err
		}
	}
	switch request.Kind {
	case domain.Products, domain.ProductDetail, domain.OriginProducts:
		if request.Kind == domain.OriginProducts {
			exists, err := s.repository.OriginExists(ctx, request.Slug)
			if err != nil {
				return nil, err
			}
			if !exists {
				return nil, &domain.Error{Status: 404, Code: "origin_not_found"}
			}
		}
		if request.Kind == domain.ProductDetail {
			query.Limit = 1
		}
		products, err := s.repository.Products(ctx, query)
		if err != nil {
			return nil, err
		}
		for i := range products {
			if err := s.presentProduct(ctx, &products[i]); err != nil {
				return nil, err
			}
		}
		if request.Kind == domain.ProductDetail {
			if len(products) == 0 {
				return nil, &domain.Error{Status: 404, Code: "product_not_found"}
			}
			return products[0], nil
		}
		return makePage(products, request, func(p domain.Product) domain.Key {
			utc := p.CreatedAt.UTC()
			return domain.Key{Slug: p.Slug, CreatedAt: &utc}
		})
	case domain.Origins, domain.OriginDetail:
		if request.Kind == domain.OriginDetail {
			query.Limit = 1
		}
		origins, err := s.repository.Origins(ctx, query)
		if err != nil {
			return nil, err
		}
		for i := range origins {
			for j := range origins[i].Images {
				if err := s.presentImage(ctx, &origins[i].Images[j]); err != nil {
					return nil, err
				}
			}
		}
		if request.Kind == domain.OriginDetail {
			if len(origins) == 0 {
				return nil, &domain.Error{Status: 404, Code: "origin_not_found"}
			}
			return origins[0], nil
		}
		return makePage(origins, request, func(o domain.Origin) domain.Key { return domain.Key{Slug: o.Slug, Name: &o.Name} })
	case domain.Categories:
		values, err := s.repository.Categories(ctx, query)
		if err != nil {
			return nil, err
		}
		return makePage(values, request, func(c domain.Category) domain.Key { return domain.Key{Slug: c.Slug, Position: &c.Position} })
	case domain.Availabilities:
		values, err := s.repository.Live(ctx, query)
		if err != nil {
			return nil, err
		}
		return makePage(values, request, func(p domain.ProductAvailability) domain.Key { return domain.Key{Slug: p.ProductSlug} })
	default:
		return nil, fmt.Errorf("unsupported catalog use case")
	}
}
func (s *Service) presentImage(ctx context.Context, image *domain.Image) error {
	url, err := s.media.Resolve(ctx, image.StorageKey)
	if err != nil {
		return fmt.Errorf("resolve catalog media: %w", err)
	}
	image.URL = url
	return nil
}
func (s *Service) presentProduct(ctx context.Context, product *domain.Product) error {
	var err error
	product.CreatedAt = product.CreatedAt.In(time.UTC)
	product.Attributes, err = domain.DisplayAttributes(product.Definitions, product.Values, "product")
	if err != nil {
		return err
	}
	if product.Categories == nil {
		product.Categories = make([]domain.Category, 0)
	}
	if product.Images == nil {
		product.Images = make([]domain.ProductImage, 0)
	}
	if product.Variants == nil {
		product.Variants = make([]domain.Variant, 0)
	}
	for i := range product.Images {
		if err := s.presentImage(ctx, &product.Images[i].Image); err != nil {
			return err
		}
	}
	for i := range product.Variants {
		product.Variants[i].Options, err = domain.DisplayAttributes(product.Definitions, product.Variants[i].Values, "variant")
		if err != nil {
			return err
		}
	}
	return nil
}
