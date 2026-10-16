package app

import (
	"context"
	"crypto/sha256"
	"encoding/hex"

	"github.com/freedomCruz/monte-luna/backend/internal/payments/domain"
)

type Reconciliation struct {
	repository domain.ReconciliationRepository
	orders     domain.OrdersPort
	gateway    domain.PaymentGateway
	clock      domain.Clock
}

func NewReconciliation(repository domain.ReconciliationRepository, orders domain.OrdersPort, gateway domain.PaymentGateway, clock domain.Clock) *Reconciliation {
	return &Reconciliation{repository: repository, orders: orders, gateway: gateway, clock: clock}
}
func (s *Reconciliation) Verify(ctx context.Context, token, hint string) (*domain.GuestPayment, error) {
	hash := sha256.Sum256([]byte(token))
	order, err := s.orders.Authorize(ctx, hex.EncodeToString(hash[:]))
	if err != nil {
		return nil, err
	}
	latest, err := s.repository.Latest(ctx, order.ID)
	if err != nil {
		return nil, err
	}
	id := hint
	if id == "" && latest != nil && latest.ProviderID != nil {
		id = *latest.ProviderID
	}
	// The public contract promises no reference lookup when no ID is known.
	// Background expiry reconciliation may use the adapter-only fallback.
	if id == "" {
		return domain.PaymentView(latest), nil
	}
	transaction, err := s.gateway.Fetch(ctx, id, "")
	if err != nil {
		return nil, err
	}
	if transaction == nil {
		return nil, domain.Problem(503, "payment_provider_unavailable")
	}
	attempt, err := s.repository.ByReference(ctx, order.ID, transaction.Reference)
	if err != nil {
		return nil, err
	}
	if attempt == nil || attempt.Amount != transaction.Amount || attempt.Currency != transaction.Currency {
		return nil, domain.Problem(422, "payment_transaction_mismatch")
	}
	if err := s.repository.Apply(ctx, *transaction, "", s.clock.Now().UTC()); err != nil {
		return nil, err
	}
	latest, err = s.repository.Latest(ctx, order.ID)
	if err != nil {
		return nil, err
	}
	return domain.PaymentView(latest), nil
}
func (s *Reconciliation) Webhook(ctx context.Context, body []byte, checksum, secret string) error {
	transaction, key, err := VerifyWebhook(body, checksum, secret)
	if err != nil {
		return err
	}
	return s.repository.Apply(ctx, transaction, key, s.clock.Now().UTC())
}
