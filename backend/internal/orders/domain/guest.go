package domain

import (
	"context"
	"time"
)

type GuestLine struct {
	Line
	ProductionDate *string `json:"production_date"`
}
type GuestAddress struct {
	RecipientName    string  `json:"recipient_name"`
	RecipientPhone   string  `json:"recipient_phone"`
	MunicipalityCode string  `json:"municipality_code"`
	MunicipalityName string  `json:"municipality_name"`
	DepartmentName   string  `json:"department_name"`
	AddressLine1     string  `json:"address_line1"`
	AddressLine2     *string `json:"address_line2"`
	DeliveryNotes    *string `json:"delivery_notes"`
}
type GuestOrder struct {
	OrderNumber          string       `json:"order_number"`
	Status               string       `json:"status"`
	PlacedAt             time.Time    `json:"placed_at"`
	ReservationExpiresAt time.Time    `json:"reservation_expires_at"`
	Lines                []GuestLine  `json:"lines"`
	Shipping             Shipping     `json:"shipping"`
	SubtotalAmount       int64        `json:"subtotal_amount"`
	ShippingAmount       int64        `json:"shipping_amount"`
	TaxAmount            int64        `json:"tax_amount"`
	TotalAmount          int64        `json:"total_amount"`
	Address              GuestAddress `json:"shipping_address"`
	Shipment             any          `json:"shipment"`
}
type GuestReader interface {
	Track(context.Context, string) (GuestOrder, error)
}

func ReservationExpired(status string, deadline, now time.Time) bool {
	return status == "pending_payment" && !deadline.After(now)
}

type ExpiryRepository interface {
	Expire(context.Context, time.Time, func(context.Context, string) error) (int, error)
	Cleanup(context.Context, time.Time) error
}
