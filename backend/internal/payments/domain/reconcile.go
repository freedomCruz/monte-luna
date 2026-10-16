package domain

import (
	"context"
	"strings"
	"time"
)

func ProviderStatus(status string) (string, error) {
	switch status {
	case "PENDING", "APPROVED", "DECLINED", "VOIDED", "ERROR":
		return strings.ToLower(status), nil
	default:
		return "", Problem(422, "validation_failed")
	}
}
func Terminal(status string) bool {
	switch status {
	case "approved", "declined", "voided", "error", "expired", "duplicate_approved":
		return true
	default:
		return false
	}
}
func PaymentView(attempt *Attempt) *GuestPayment {
	if attempt == nil {
		return nil
	}
	var method *string
	if attempt.Method != nil {
		value := strings.ToLower(*attempt.Method)
		method = &value
	}
	return &GuestPayment{Status: attempt.Status, Method: method}
}

type ReconciliationRepository interface {
	Latest(context.Context, string) (*Attempt, error)
	ByReference(context.Context, string, string) (*Attempt, error)
	Apply(context.Context, Transaction, string, time.Time) error
}
