// Package domain defines payment invariants and consumer-owned ports.
package domain

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"strconv"
	"time"
)

type Error struct {
	Status int
	Code   string
}

func (e *Error) Error() string              { return e.Code }
func Problem(status int, code string) error { return &Error{Status: status, Code: code} }
func IntegritySignature(reference string, amount int64, currency, expiration, secret string) string {
	sum := sha256.Sum256([]byte(reference + strconv.FormatInt(amount, 10) + currency + expiration + secret))
	return hex.EncodeToString(sum[:])
}
func ValidateRefund(amount, completed, requested int64) error {
	if amount <= 0 || completed < 0 || requested <= 0 || completed > amount || requested > amount-completed {
		return errors.New("completed refunds cannot exceed attempt amount")
	}
	return nil
}

type Order struct {
	ID, Number, Status, Currency string
	Amount                       int64
	ExpiresAt, PlacedAt          time.Time
}
type Checkout struct {
	PublicKey          string `json:"public_key"`
	Currency           string `json:"currency"`
	Amount             int64  `json:"amount_in_cents"`
	Reference          string `json:"reference"`
	IntegritySignature string `json:"integrity_signature"`
	ExpiresAt          string `json:"expires_at"`
	RedirectURL        string `json:"redirect_url"`
}
type Attempt struct {
	ID, OrderID, Reference, Status, Currency string
	Amount                                   int64
	ProviderID, Method, StatusMessage        *string
	ExpiresAt, CreatedAt                     time.Time
	FinalizedAt                              *time.Time
}
type Transaction struct {
	ID            string     `json:"id"`
	Reference     string     `json:"reference"`
	Amount        int64      `json:"amount_in_cents"`
	Currency      string     `json:"currency"`
	Status        string     `json:"status"`
	Method        *string    `json:"payment_method_type"`
	StatusMessage *string    `json:"status_message"`
	FinalizedAt   *time.Time `json:"finalized_at"`
}
type GuestPayment struct {
	Status string  `json:"latest_attempt_status"`
	Method *string `json:"payment_method_type"`
}
type OrdersPort interface {
	Authorize(context.Context, string) (Order, error)
	OrderNumber(context.Context, string) (string, error)
}
type Clock interface{ Now() time.Time }
type References interface{ Reference() (string, error) }
type PaymentGateway interface {
	Fetch(context.Context, string, string) (*Transaction, error)
}
type Repository interface {
	BeginStart(context.Context, string, string) (StartTx, error)
}
type StartTx interface {
	Replay(context.Context, string, time.Time) (*Checkout, error)
	State(context.Context) (approved, pending bool, err error)
	Save(context.Context, Attempt, Checkout, string, time.Time) error
	Commit(context.Context) error
	Rollback(context.Context) error
}
