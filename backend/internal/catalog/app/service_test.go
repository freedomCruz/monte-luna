package app_test

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/freedomCruz/monte-luna/backend/internal/catalog/app"
	"github.com/freedomCruz/monte-luna/backend/internal/catalog/domain"
)

type repository struct {
	queries []domain.Query
	failure error
}

func (r *repository) Products(_ context.Context, q domain.Query) ([]domain.Product, error) {
	r.queries = append(r.queries, q)
	return []domain.Product{{Slug: "a", CreatedAt: time.Date(2026, 10, 1, 0, 0, 0, 0, time.UTC)}, {Slug: "b", CreatedAt: time.Date(2026, 10, 1, 0, 0, 0, 0, time.UTC)}}, r.failure
}
func (r *repository) Origins(context.Context, domain.Query) ([]domain.Origin, error) {
	return nil, r.failure
}
func (r *repository) Categories(context.Context, domain.Query) ([]domain.Category, error) {
	return nil, r.failure
}
func (r *repository) Live(context.Context, domain.Query) ([]domain.ProductAvailability, error) {
	return nil, r.failure
}
func (r *repository) OriginExists(context.Context, string) (bool, error) { return true, r.failure }

type media struct{}

func (media) Resolve(_ context.Context, key string) (string, error) {
	return "https://media.example/" + key, nil
}

func TestInvalidRequestsNeverReachRepository(t *testing.T) {
	for _, tc := range []struct {
		name    string
		request domain.Request
	}{
		{"zero_limit", domain.Request{Kind: domain.Products, Limit: 0}},
		{"too_large_limit", domain.Request{Kind: domain.Products, Limit: 101}},
		{"unsupported_sort", domain.Request{Kind: domain.Products, Limit: 24, Sort: "title"}},
		{"bad_filter", domain.Request{Kind: domain.Products, Limit: 24, Categories: []string{"Coffee!"}}},
		{"missing_live_slugs", domain.Request{Kind: domain.Availabilities, Limit: 24}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			r := &repository{}
			s := app.NewService(r, media{})
			_, err := s.Read(t.Context(), tc.request)
			var problem *domain.Error
			if !errors.As(err, &problem) || problem.Code != "validation_failed" {
				t.Fatalf("error=%v", err)
			}
			if len(r.queries) != 0 {
				t.Error("invalid request read repository")
			}
		})
	}
}
func TestPaginationAndCursorBinding(t *testing.T) {
	r := &repository{}
	s := app.NewService(r, media{})
	request := domain.Request{Kind: domain.Products, Limit: 1, Categories: []string{"coffee"}}
	value, err := s.Read(t.Context(), request)
	if err != nil {
		t.Fatal(err)
	}
	page := value.(domain.Page[domain.Product])
	if len(page.Items) != 1 || page.NextCursor == nil {
		t.Fatal("page must trim lookahead and return cursor")
	}
	if r.queries[0].Limit != 2 {
		t.Error("repository did not fetch one lookahead product")
	}
	request.Cursor = *page.NextCursor
	if _, err := s.Read(t.Context(), request); err != nil {
		t.Fatal(err)
	}
	if r.queries[1].After.Slug != "a" || r.queries[1].After.CreatedAt == nil {
		t.Error("cursor did not resume after last returned product")
	}
	for _, tc := range []struct {
		name    string
		request domain.Request
	}{
		{"changed_filter", domain.Request{Kind: domain.Products, Limit: 1, Categories: []string{"cacao"}, Cursor: request.Cursor}},
		{"changed_endpoint", domain.Request{Kind: domain.Origins, Limit: 1, Cursor: request.Cursor}},
		{"malformed", domain.Request{Kind: domain.Products, Limit: 1, Cursor: "not-a-cursor"}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			before := len(r.queries)
			_, err := s.Read(t.Context(), tc.request)
			var problem *domain.Error
			if !errors.As(err, &problem) || problem.Code != "invalid_cursor" {
				t.Fatalf("error=%v", err)
			}
			if len(r.queries) != before {
				t.Error("invalid cursor read repository")
			}
		})
	}
}
func TestRepositoryFailurePropagates(t *testing.T) {
	want := errors.New("repository unavailable")
	s := app.NewService(&repository{failure: want}, media{})
	_, err := s.Read(t.Context(), domain.Request{Kind: domain.Products, Limit: 24})
	if !errors.Is(err, want) {
		t.Fatalf("error=%v", err)
	}
}
