package app_test

import (
	"context"
	"errors"
	"testing"

	"github.com/freedomCruz/monte-luna/backend/internal/shipping/app"
	"github.com/freedomCruz/monte-luna/backend/internal/shipping/domain"
)

type repository struct {
	zone  string
	rates []domain.Rate
	err   error
	calls int
}

func (r *repository) FindZone(_ context.Context, code string) (string, error) {
	r.calls++
	if code != "05001" {
		return "", &domain.UnsupportedDestinationError{}
	}
	return r.zone, r.err
}
func (r *repository) ListRates(_ context.Context, zone string) ([]domain.Rate, error) {
	if zone != r.zone {
		panic("wrong zone")
	}
	return r.rates, r.err
}
func TestQuote(t *testing.T) {
	for _, tc := range []struct {
		name, code string
		weight     int32
		subtotal   int64
		failure    string
	}{
		{"quote", "05001", 250, 0, ""}, {"unknown municipality", "99999", 250, 0, "unknown"},
		{"invalid weight", "05001", 0, 0, "invalid"}, {"negative weight", "05001", -1, 0, "invalid"},
		{"invalid subtotal", "05001", 250, -1, "invalid"}, {"unsupported zone", "11001", 250, 0, "unsupported"},
		{"unsupported weight", "05001", 1001, 0, "unsupported"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			maxWeight := int32(1000)
			repo := &repository{zone: "zone", rates: []domain.Rate{{Name: "Parcel", Status: "active", PriceAmount: 100, Currency: "COP", MaxWeightGrams: &maxWeight, EstimatedDaysMin: 3, EstimatedDaysMax: 5}}}
			service := app.NewService(repo, domain.NewReference())
			got, err := service.Quote(t.Context(), domain.QuoteInput{MunicipalityCode: tc.code, TotalWeightGrams: tc.weight, OrderSubtotal: tc.subtotal})
			switch tc.failure {
			case "":
				if err != nil || got.Amount != 100 || got.RegularAmount != 100 || got.RateName != "Parcel" || got.EstimatedDaysMin != 3 || got.EstimatedDaysMax != 5 {
					t.Fatalf("%+v / %v", got, err)
				}
			case "unknown":
				var target *domain.UnknownMunicipalityError
				if !errors.As(err, &target) || repo.calls != 0 {
					t.Fatalf("error=%v calls=%d", err, repo.calls)
				}
			case "invalid":
				if !errors.Is(err, domain.ErrInvalidQuote) || repo.calls != 0 {
					t.Fatalf("error=%v calls=%d", err, repo.calls)
				}
			case "unsupported":
				var target *domain.UnsupportedDestinationError
				if !errors.As(err, &target) {
					t.Fatalf("error=%v", err)
				}
			}
		})
	}
}
func TestQuoteRepositoryFailure(t *testing.T) {
	failure := errors.New("storage failure")
	repo := &repository{err: failure}
	_, err := app.NewService(repo, domain.NewReference()).Quote(t.Context(), domain.QuoteInput{MunicipalityCode: "05001", TotalWeightGrams: 1})
	if !errors.Is(err, failure) {
		t.Fatalf("error = %v", err)
	}
}
