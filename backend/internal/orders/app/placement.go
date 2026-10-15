package app

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/freedomCruz/monte-luna/backend/internal/orders/domain"
)

type Placement struct {
	quote      *Service
	repository domain.PlacementRepository
	inventory  domain.InventoryPort
	lookup     domain.AddressLookup
	clock      domain.Clock
	numbers    domain.OrderNumbers
	secret     []byte
}

func NewPlacement(quote *Service, repository domain.PlacementRepository, inventory domain.InventoryPort, lookup domain.AddressLookup, clock domain.Clock, numbers domain.OrderNumbers, secret []byte) *Placement {
	return &Placement{quote: quote, repository: repository, inventory: inventory, lookup: lookup, clock: clock, numbers: numbers, secret: append([]byte(nil), secret...)}
}
func (s *Placement) Place(ctx context.Context, key string, request domain.PlaceRequest) (result domain.PlacedOrder, err error) {
	key, err = domain.NormalizeKey(key)
	if err != nil {
		return result, err
	}
	if err := domain.ValidatePlacement(request); err != nil {
		return result, err
	}
	hash, err := domain.RequestHash(request)
	if err != nil {
		return result, err
	}
	tx, err := s.repository.BeginPlacement(ctx, key)
	if err != nil {
		return result, err
	}
	defer func() {
		cleanup, cancel := context.WithTimeout(context.WithoutCancel(ctx), 10*time.Second)
		defer cancel()
		err = errors.Join(err, tx.Rollback(cleanup))
	}()
	now := s.clock.Now().UTC().Truncate(time.Microsecond)
	replay, err := tx.Replay(ctx, hash, now)
	if err != nil {
		return result, err
	}
	token := domain.TrackingToken(s.secret, key)
	if replay != nil {
		replay.TrackingToken = token
		return *replay, nil
	}
	tokenHash := domain.TokenHash(token)
	exists, err := tx.TokenExists(ctx, tokenHash)
	if err != nil {
		return result, err
	}
	if exists {
		return result, &domain.Error{Status: 422, Code: "idempotency_key_reused"}
	}
	request.Address.DepartmentName, request.Address.MunicipalityName, err = s.lookup.LookupAddress(request.Address.MunicipalityCode)
	if err != nil {
		return result, addressError(err)
	}
	quote, err := s.quote.Quote(ctx, domain.QuoteRequest{Items: request.Items, MunicipalityCode: request.Address.MunicipalityCode})
	if err != nil {
		return result, addressError(err)
	}
	orderID, err := tx.NewID(ctx)
	if err != nil {
		return result, err
	}
	allocations, err := s.inventory.Allocate(ctx, orderID, request.Items)
	if err != nil {
		return result, err
	}
	committed, uncertain := false, false
	defer func() {
		if !committed && !uncertain {
			cleanup, cancel := context.WithTimeout(context.WithoutCancel(ctx), 10*time.Second)
			defer cancel()
			if releaseErr := s.inventory.Release(cleanup, orderID); releaseErr != nil {
				err = errors.Join(err, fmt.Errorf("compensating stock release failed: %w", releaseErr))
			}
		}
	}()
	order := domain.Order{ID: orderID, Key: key, RequestHash: hash, TokenHash: tokenHash, Request: request, Quote: quote, Allocations: allocations, PlacedAt: now, ExpiresAt: now.Add(30 * time.Minute)}
	for attempt := range 5 {
		order.Number, err = s.numbers.OrderNumber()
		if err != nil {
			return result, err
		}
		err = tx.Save(ctx, order)
		if errors.Is(err, domain.ErrOrderNumberCollision) && attempt < 4 {
			continue
		}
		if err != nil {
			return result, err
		}
		break
	}
	if err := tx.Commit(ctx); err != nil {
		uncertain = errors.Is(err, domain.ErrCommitUncertain)
		return result, err
	}
	committed = true
	return domain.PlacedOrder{OrderID: order.ID, OrderNumber: order.Number, Status: "pending_payment", TotalAmount: quote.TotalAmount, ReservationExpiresAt: order.ExpiresAt, TrackingToken: token}, nil
}
func addressError(err error) error {
	var known *domain.Error
	if errors.As(err, &known) {
		for i := range known.Fields {
			if known.Fields[i].Field == "municipality_code" {
				known.Fields[i].Field = "shipping_address.municipality_code"
			}
		}
	}
	return err
}
