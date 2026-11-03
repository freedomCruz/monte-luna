package domain

import (
	"context"
	"regexp"
)

// OrderContact is what the orders public port shares for customer emails.
// CancelReason is set only for an admin cancellation with a note.
type OrderContact struct {
	OrderNumber, Email, Name string
	CancelReason             *string
}

type OrderContacts interface {
	OrderContact(context.Context, string) (OrderContact, error)
}

var orderIDPattern = regexp.MustCompile(`^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`)

// ValidOrderID accepts any lowercase UUID; orders created before UUIDv7 stay valid.
func ValidOrderID(id string) bool { return orderIDPattern.MatchString(id) }
