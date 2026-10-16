// Package domain defines shipping quote rules and persistence ports.
package domain

import (
	"context"
	"errors"
	"fmt"
	"regexp"
)

var ErrInvalidQuote = errors.New("invalid shipping quote input")

// UnsupportedDestinationError means that no active zone or weight band covers the request.
type UnsupportedDestinationError struct{}

func (*UnsupportedDestinationError) Error() string { return "unsupported_destination" }

// UnknownMunicipalityError means the code is absent from the versioned DANE snapshot.
type UnknownMunicipalityError struct{ Code string }

func (*UnknownMunicipalityError) Error() string { return "unknown_municipality" }

type QuoteInput struct {
	MunicipalityCode string
	TotalWeightGrams int32
	OrderSubtotal    int64
}
type Quote struct {
	RateName         string
	Amount           int64
	RegularAmount    int64
	Currency         string
	FreeShipping     bool
	EstimatedDaysMin int32
	EstimatedDaysMax int32
}
type Rate struct {
	ID, ZoneID, Name, Currency, Status string
	PriceAmount                        int64
	MinWeightGrams                     int32
	MaxWeightGrams                     *int32
	FreeShippingThresholdAmount        *int64
	EstimatedDaysMin, EstimatedDaysMax int32
}
type Repository interface {
	// FindZone selects an active municipality zone before an active department zone,
	// independently of weight; a municipality with no fitting rate cannot fall back.
	FindZone(context.Context, string) (string, error)
	ListRates(context.Context, string) ([]Rate, error)
}

// ValidateRate rejects invalid fields and inclusive overlapping active bands.
// Existing is the set of persisted rates in the same operation's transaction.
func ValidateRate(rate Rate, existing []Rate) error {
	if rate.ZoneID == "" || rate.Name == "" || !regexp.MustCompile(`^[A-Z]{3}$`).MatchString(rate.Currency) ||
		rate.PriceAmount < 0 || rate.MinWeightGrams < 0 || (rate.Status != "active" && rate.Status != "archived") ||
		(rate.MaxWeightGrams != nil && *rate.MaxWeightGrams <= rate.MinWeightGrams) ||
		(rate.FreeShippingThresholdAmount != nil && *rate.FreeShippingThresholdAmount <= 0) ||
		rate.EstimatedDaysMin < 1 || rate.EstimatedDaysMax < rate.EstimatedDaysMin {
		return errors.New("invalid shipping rate")
	}
	for _, other := range existing {
		if rate.Status != "active" || other.Status != "active" || rate.ZoneID != other.ZoneID || (rate.ID != "" && rate.ID == other.ID) {
			continue
		}
		if (rate.MaxWeightGrams == nil || other.MinWeightGrams <= *rate.MaxWeightGrams) && (other.MaxWeightGrams == nil || rate.MinWeightGrams <= *other.MaxWeightGrams) {
			return fmt.Errorf("shipping weight band overlaps rate %q", other.Name)
		}
	}
	return nil
}

func ResolveRate(rates []Rate, weight int32, subtotal int64) (Quote, error) {
	for _, rate := range rates {
		if rate.Status != "active" || weight < rate.MinWeightGrams || (rate.MaxWeightGrams != nil && weight > *rate.MaxWeightGrams) {
			continue
		}
		free := rate.FreeShippingThresholdAmount != nil && subtotal >= *rate.FreeShippingThresholdAmount
		amount := rate.PriceAmount
		if free {
			amount = 0
		}
		return Quote{RateName: rate.Name, Amount: amount, RegularAmount: rate.PriceAmount, Currency: rate.Currency, FreeShipping: free, EstimatedDaysMin: rate.EstimatedDaysMin, EstimatedDaysMax: rate.EstimatedDaysMax}, nil
	}
	return Quote{}, &UnsupportedDestinationError{}
}
