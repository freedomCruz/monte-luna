package domain

import "time"

// PaymentOrder exposes only the authoritative data needed to start a payment.
type PaymentOrder struct {
	ID, Number, Status, Currency string
	Amount                       int64
	ExpiresAt, PlacedAt          time.Time
}
