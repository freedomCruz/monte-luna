package domain

// InventoryOrder deliberately excludes buyer data and tracking credentials.
type InventoryOrder struct {
	ID               string `json:"id"`
	OrderNumber      string `json:"order_number"`
	Status           string `json:"status"`
	ReservationState string `json:"reservation_state"`
}
type HeldInventory struct {
	VariantID string
	LotID     string
	Quantity  int64
}

// A pending order still owns its allocation until expiry processing changes its
// state and releases stock. A wall-clock deadline alone cannot return the units;
// this also includes payment grace without guessing its duration in catalog.
func InventoryReservationState(status string) string {
	switch status {
	case "pending_payment":
		return "held"
	case "paid", "preparing", "shipped", "delivered":
		return "committed"
	default:
		return "released"
	}
}
