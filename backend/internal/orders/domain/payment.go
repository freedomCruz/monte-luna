package domain

import (
	"context"
	"time"
)

// PaymentOrder exposes only the authoritative data needed to start a payment.
type GuestPayment struct {
	Status string  `json:"latest_attempt_status"`
	Method *string `json:"payment_method_type"`
}
type ReallocationPort interface {
	Reallocate(context.Context, string, []Item) ([]Allocation, error)
}
type PaymentsPort interface {
	Payment(context.Context, string) (*GuestPayment, error)
	InFlight(context.Context, string) (bool, error)
}

func PaymentTransition(status string, stock bool) string {
	if status == "pending_payment" {
		return "paid"
	}
	if status == "expired" {
		if stock {
			return "paid"
		}
		return "cancelled"
	}
	return ""
}
func PaymentGrace(placed, deadline, now time.Time, inFlight bool) (time.Time, bool) {
	ceiling := placed.Add(2 * time.Hour)
	if !inFlight || !now.Before(ceiling) {
		return time.Time{}, false
	}
	next := deadline.Add(15 * time.Minute)
	if next.After(ceiling) {
		next = ceiling
	}
	if !next.After(now) {
		return time.Time{}, false
	}
	return next, true
}

type PaymentOrder struct {
	ID, Number, Status, Currency string
	Amount                       int64
	ExpiresAt, PlacedAt          time.Time
}
