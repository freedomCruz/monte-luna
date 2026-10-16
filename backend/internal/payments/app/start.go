package app

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"net/url"
	"time"

	"github.com/freedomCruz/monte-luna/backend/internal/payments/domain"
)

type CheckoutConfig struct{ PublicKey, IntegritySecret, StorefrontBaseURL string }
type Start struct {
	repository domain.Repository
	orders     domain.OrdersPort
	clock      domain.Clock
	references domain.References
	config     CheckoutConfig
}

func NewStart(repository domain.Repository, orders domain.OrdersPort, clock domain.Clock, references domain.References, config CheckoutConfig) *Start {
	return &Start{repository: repository, orders: orders, clock: clock, references: references, config: config}
}
func (s *Start) Start(ctx context.Context, key, token string) (domain.Checkout, error) {
	sum := sha256.Sum256([]byte(token))
	hash := hex.EncodeToString(sum[:])
	order, err := s.orders.Authorize(ctx, hash)
	if err != nil {
		return domain.Checkout{}, err
	}
	tx, err := s.repository.BeginStart(ctx, order.ID, key)
	if err != nil {
		return domain.Checkout{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	now := s.clock.Now().UTC()
	checkout, err := tx.Replay(ctx, hash, now)
	if err != nil {
		return domain.Checkout{}, err
	}
	redirect := s.config.StorefrontBaseURL + "/pedido?token=" + url.QueryEscape(token)
	if checkout != nil {
		checkout.RedirectURL = redirect
		return *checkout, nil
	}
	approved, pending, err := tx.State(ctx)
	if err != nil {
		return domain.Checkout{}, err
	}
	if order.Status != "pending_payment" || !order.ExpiresAt.After(now) || approved || order.Currency != "COP" || order.Amount <= 0 {
		return domain.Checkout{}, domain.Problem(409, "order_not_payable")
	}
	if pending {
		return domain.Checkout{}, domain.Problem(409, "payment_pending")
	}
	reference, err := s.references.Reference()
	if err != nil {
		return domain.Checkout{}, err
	}
	expiration := order.ExpiresAt.UTC().Format(time.RFC3339Nano)
	result := domain.Checkout{PublicKey: s.config.PublicKey, Currency: order.Currency, Amount: order.Amount, Reference: reference, ExpiresAt: expiration, RedirectURL: redirect, IntegritySignature: domain.IntegritySignature(reference, order.Amount, order.Currency, expiration, s.config.IntegritySecret)}
	attempt := domain.Attempt{OrderID: order.ID, Reference: reference, Status: "created", Currency: order.Currency, Amount: order.Amount, ExpiresAt: order.ExpiresAt, CreatedAt: now}
	if err := tx.Save(ctx, attempt, result, hash, now); err != nil {
		return domain.Checkout{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return domain.Checkout{}, err
	}
	return result, nil
}
