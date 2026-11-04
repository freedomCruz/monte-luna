package domain

import (
	"context"
	"strings"
	"time"
)

// Admin actions that change order status. Dispatch is owned by shipping and
// reaches orders only through the shipment_shipped event.
const (
	AdminPrepare = "prepare"
	AdminDeliver = "deliver"
	AdminCancel  = "cancel"
)

// AdminTarget returns the status an admin action moves the order to, or ""
// when the action is not allowed from the current status.
func AdminTarget(action, status string) string {
	switch {
	case action == AdminPrepare && status == "paid":
		return "preparing"
	case action == AdminDeliver && status == "shipped":
		return "delivered"
	case action == AdminCancel && (status == "paid" || status == "preparing"):
		return "cancelled"
	}
	return ""
}

// ShippedPath returns the history steps a shipment_shipped event records:
// paid orders are auto-prepared in the same transaction (S5). Orders already
// shipped or delivered return nil so delayed events never regress them.
func ShippedPath(status string) ([][2]string, bool) {
	switch status {
	case "paid":
		return [][2]string{{"paid", "preparing"}, {"preparing", "shipped"}}, true
	case "preparing":
		return [][2]string{{"preparing", "shipped"}}, true
	case "shipped", "delivered":
		return nil, true
	}
	return nil, false
}

// CancelNote trims the optional human reason; blank becomes nil.
func CancelNote(reason *string) *string {
	if reason == nil {
		return nil
	}
	trimmed := strings.TrimSpace(*reason)
	if trimmed == "" {
		return nil
	}
	return &trimmed
}

type AdminWrite struct {
	OrderID  string
	Version  int32
	ActorID  string
	Action   string
	Note     *string
	At       time.Time
	Release  func(context.Context, string) error
	Dispatch func(context.Context, string) (bool, error)
}

type AdminWriteRepository interface {
	AdminTransition(context.Context, AdminWrite) error
}

// OrderInventory is the catalog capability orders uses after placement.
type OrderInventory interface {
	ReallocationPort
	Release(context.Context, string) error
}
