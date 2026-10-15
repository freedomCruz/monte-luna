package domain_test

import (
	"errors"
	"testing"

	"github.com/freedomCruz/monte-luna/backend/internal/shipping/domain"
)

func ptr[T any](v T) *T { return &v }

func TestRateQuote(t *testing.T) {
	rate := domain.Rate{Name: "Standard", ZoneID: "zone", PriceAmount: 1200000, Currency: "COP", MinWeightGrams: 0, MaxWeightGrams: ptr(int32(1000)), FreeShippingThresholdAmount: ptr(int64(15000000)), EstimatedDaysMin: 2, EstimatedDaysMax: 4, Status: "active"}
	for _, tc := range []struct {
		name              string
		weight            int32
		subtotal          int64
		amount            int64
		free, unsupported bool
	}{
		{"lower weight", 1, 0, 1200000, false, false},
		{"upper weight", 1000, 14999999, 1200000, false, false},
		{"threshold", 1000, 15000000, 0, true, false},
		{"above threshold", 1000, 15000001, 0, true, false},
		{"uncovered weight", 1001, 0, 0, false, true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			got, err := domain.ResolveRate([]domain.Rate{rate}, tc.weight, tc.subtotal)
			if tc.unsupported {
				var unsupported *domain.UnsupportedDestinationError
				if !errors.As(err, &unsupported) {
					t.Fatalf("error = %v", err)
				}
				return
			}
			if err != nil {
				t.Fatal(err)
			}
			if got.RateName != "Standard" || got.Amount != tc.amount || got.RegularAmount != 1200000 || got.FreeShipping != tc.free || got.Currency != "COP" || got.EstimatedDaysMin != 2 || got.EstimatedDaysMax != 4 {
				t.Fatalf("quote = %+v", got)
			}
		})
	}
}

func TestRequiredEstimatedDays(t *testing.T) {
	for _, tc := range []struct {
		name     string
		min, max int32
		invalid  bool
	}{
		{"zero minimum", 0, 5, true},
		{"negative minimum", -1, 5, true},
		{"reversed range", 3, 2, true},
		{"zero maximum", 3, 0, true},
		{"minimum boundary", 1, 1, false},
		{"business day demo", 3, 5, false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			rate := domain.Rate{ZoneID: "zone", Name: "Standard", Currency: "COP", Status: "active", EstimatedDaysMin: tc.min, EstimatedDaysMax: tc.max}
			if err := domain.ValidateRate(rate, nil); (err != nil) != tc.invalid {
				t.Fatalf("ValidateRate(%d, %d) = %v", tc.min, tc.max, err)
			}
		})
	}
}

func TestRateValidationAndOverlap(t *testing.T) {
	base := domain.Rate{ZoneID: "zone", Name: "Standard", Currency: "COP", PriceAmount: 1, MinWeightGrams: 0, MaxWeightGrams: ptr(int32(1000)), EstimatedDaysMin: 3, EstimatedDaysMax: 5, Status: "active"}
	for _, tc := range []struct {
		name    string
		change  func(*domain.Rate)
		invalid bool
	}{
		{"inclusive shared boundary", func(r *domain.Rate) { r.MinWeightGrams = 1000; r.MaxWeightGrams = nil }, true},
		{"next gram", func(r *domain.Rate) { r.MinWeightGrams = 1001; r.MaxWeightGrams = nil }, false},
		{"contained", func(r *domain.Rate) { r.MinWeightGrams = 100; r.MaxWeightGrams = ptr(int32(500)) }, true},
		{"other zone", func(r *domain.Rate) { r.ZoneID = "other" }, false},
		{"archived", func(r *domain.Rate) { r.Status = "archived" }, false},
		{"negative price", func(r *domain.Rate) { r.PriceAmount = -1 }, true},
		{"invalid band", func(r *domain.Rate) { r.MaxWeightGrams = ptr(int32(0)) }, true},
		{"invalid threshold", func(r *domain.Rate) { r.FreeShippingThresholdAmount = ptr(int64(0)) }, true},
		{"reversed days", func(r *domain.Rate) { r.EstimatedDaysMin = 4; r.EstimatedDaysMax = 2 }, true},
		{"negative days", func(r *domain.Rate) { r.EstimatedDaysMin = -1 }, true},
		{"invalid currency", func(r *domain.Rate) { r.Currency = "cop" }, true},
		{"invalid status", func(r *domain.Rate) { r.Status = "draft" }, true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			candidate := base
			tc.change(&candidate)
			err := domain.ValidateRate(candidate, []domain.Rate{base})
			if (err != nil) != tc.invalid {
				t.Fatalf("error = %v", err)
			}
		})
	}
	open := base
	open.MaxWeightGrams = nil
	next := base
	next.MinWeightGrams = 1001
	next.MaxWeightGrams = nil
	if err := domain.ValidateRate(next, []domain.Rate{open}); err == nil {
		t.Fatal("open-ended overlap accepted")
	}
}

func TestDIVIPOLALookupAndAreaValidation(t *testing.T) {
	reference := domain.NewReference()
	for _, tc := range []struct{ code, department, municipality string }{
		{"11001", "Bogotá, D. C.", "Bogotá, D. C."}, {"05001", "Antioquia", "Medellín"},
	} {
		t.Run(tc.code, func(t *testing.T) {
			got, err := reference.Lookup(tc.code)
			if err != nil {
				t.Fatal(err)
			}
			if got.DepartmentName != tc.department || got.MunicipalityName != tc.municipality {
				t.Fatalf("lookup = %+v", got)
			}
		})
	}
	for _, code := range []string{"99999", "05000", "1100", "", "abcde"} {
		_, err := reference.Lookup(code)
		var unknown *domain.UnknownMunicipalityError
		if !errors.As(err, &unknown) {
			t.Fatalf("%q error = %v", code, err)
		}
	}
	for _, tc := range []struct {
		department   string
		municipality *string
		invalid      bool
	}{
		{"05", nil, false}, {"05", ptr("05001"), false}, {"11", ptr("05001"), true}, {"99", ptr("99999"), true}, {"00", nil, true},
	} {
		if err := reference.ValidateArea(tc.department, tc.municipality); (err != nil) != tc.invalid {
			t.Fatalf("area %s/%v error = %v", tc.department, tc.municipality, err)
		}
	}
}
