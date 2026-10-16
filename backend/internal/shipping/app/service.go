// Package app composes shipping reference validation and quote resolution.
package app

import (
	"context"
	"fmt"

	"github.com/freedomCruz/monte-luna/backend/internal/shipping/domain"
)

type Service struct {
	repository domain.Repository
	reference  *domain.Reference
}

func NewService(repository domain.Repository, reference *domain.Reference) *Service {
	return &Service{repository: repository, reference: reference}
}
func (s *Service) Quote(ctx context.Context, input domain.QuoteInput) (domain.Quote, error) {
	if _, err := s.reference.Lookup(input.MunicipalityCode); err != nil {
		return domain.Quote{}, err
	}
	if input.TotalWeightGrams <= 0 || input.OrderSubtotal < 0 {
		return domain.Quote{}, domain.ErrInvalidQuote
	}
	zone, err := s.repository.FindZone(ctx, input.MunicipalityCode)
	if err != nil {
		return domain.Quote{}, fmt.Errorf("resolve shipping zone: %w", err)
	}
	rates, err := s.repository.ListRates(ctx, zone)
	if err != nil {
		return domain.Quote{}, fmt.Errorf("load shipping rates: %w", err)
	}
	return domain.ResolveRate(rates, input.TotalWeightGrams, input.OrderSubtotal)
}
