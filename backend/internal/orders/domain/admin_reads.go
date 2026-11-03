package domain

import (
	"context"
	"time"
)

type AdminPaymentSummary struct {
	Status string  `json:"status"`
	Method *string `json:"payment_method_type"`
}
type AdminPaymentAttempt struct {
	ID          string     `json:"id"`
	Reference   string     `json:"reference"`
	Status      string     `json:"status"`
	Method      *string    `json:"payment_method_type"`
	ProviderID  *string    `json:"provider_transaction_id"`
	CreatedAt   time.Time  `json:"created_at"`
	FinalizedAt *time.Time `json:"finalized_at"`
}
type AdminOrderRow struct {
	ID               string               `json:"id"`
	Number           string               `json:"order_number"`
	PlacedAt         time.Time            `json:"placed_at"`
	CustomerName     string               `json:"customer_name"`
	CustomerEmail    string               `json:"customer_email"`
	MunicipalityName string               `json:"municipality_name"`
	DepartmentName   string               `json:"department_name"`
	TotalAmount      int64                `json:"total_amount"`
	Status           string               `json:"status"`
	Payment          *AdminPaymentSummary `json:"payment"`
}
type AdminOrderPage struct {
	Items                []AdminOrderRow `json:"items"`
	NextCursor           *string         `json:"next_cursor"`
	Total                int64           `json:"total"`
	PendingDispatchCount int64           `json:"pending_dispatch_count"`
}
type AdminLotAllocation struct {
	LotID          string `json:"lot_id"`
	LotCode        string `json:"lot_code"`
	ProductionDate string `json:"production_date"`
	Quantity       int32  `json:"quantity"`
}
type AdminOrderLine struct {
	Line
	ID             string               `json:"id"`
	ImageURL       *string              `json:"image_url"`
	DiscountAmount int64                `json:"discount_amount"`
	TaxAmount      int64                `json:"tax_amount"`
	LotAllocations []AdminLotAllocation `json:"lot_allocations"`
}
type AdminShippingRate struct {
	RateName         string  `json:"rate_name"`
	ZoneName         *string `json:"zone_name"`
	MinWeightGrams   *int32  `json:"min_weight_grams"`
	MaxWeightGrams   *int32  `json:"max_weight_grams"`
	EstimatedDaysMin int32   `json:"estimated_days_min"`
	EstimatedDaysMax int32   `json:"estimated_days_max"`
}
type AdminOrderSummary struct {
	SubtotalAmount         int64             `json:"subtotal_amount"`
	DiscountAmount         int64             `json:"discount_amount"`
	CouponCode             *string           `json:"coupon_code"`
	ShippingAmount         int64             `json:"shipping_amount"`
	ShippingDiscountAmount int64             `json:"shipping_discount_amount"`
	TaxAmount              int64             `json:"tax_amount"`
	TotalAmount            int64             `json:"total_amount"`
	Shipping               AdminShippingRate `json:"shipping"`
}
type AdminHistory struct {
	ID         string    `json:"id"`
	FromStatus *string   `json:"from_status"`
	ToStatus   string    `json:"to_status"`
	ActorType  string    `json:"actor_type"`
	ActorID    *string   `json:"actor_id"`
	Note       *string   `json:"note"`
	CreatedAt  time.Time `json:"created_at"`
}
type AdminAddress struct {
	GuestAddress
	PostalCode *string `json:"postal_code"`
}
type AdminShipment struct {
	ID             string     `json:"id"`
	OrderID        string     `json:"order_id"`
	Status         string     `json:"status"`
	CarrierName    *string    `json:"carrier_name"`
	TrackingNumber *string    `json:"tracking_number"`
	TrackingURL    *string    `json:"tracking_url"`
	ShippedAt      *time.Time `json:"shipped_at"`
	DeliveredAt    *time.Time `json:"delivered_at"`
	ActorID        *string    `json:"actor_id"`
	Version        int32      `json:"version"`
}
type AdminOrder struct {
	ID          string                `json:"id"`
	Number      string                `json:"order_number"`
	Status      string                `json:"status"`
	Payment     *AdminPaymentSummary  `json:"payment"`
	PlacedAt    time.Time             `json:"placed_at"`
	PaidAt      *time.Time            `json:"paid_at"`
	CancelledAt *time.Time            `json:"cancelled_at"`
	Customer    Customer              `json:"customer"`
	Address     AdminAddress          `json:"shipping_address"`
	Lines       []AdminOrderLine      `json:"lines"`
	Summary     AdminOrderSummary     `json:"summary"`
	Attempts    []AdminPaymentAttempt `json:"payment_attempts"`
	History     []AdminHistory        `json:"status_history"`
	Shipment    *AdminShipment        `json:"shipment"`
	Version     int32                 `json:"version"`
}
type AdminFilter struct {
	Search            string
	Statuses, Methods []string
	From, To          *time.Time
	Pending           bool
	Sort              string
	Limit             int
	Cursor            string
	Fingerprint       string
	MaxRows           int `json:"-"` // Internal latest-orders cap, never a public query field.
}
type AdminReadRepository interface {
	ScanAdminRows(context.Context, AdminFilter, func([]AdminOrderRow) error) error
	ReadAdminOrder(context.Context, string) (AdminOrder, error)
	AdminAttention(context.Context) (int64, *time.Time, error)
	ScanAdminPaid(context.Context, time.Time, time.Time, func(PaidOrder) error) error
}
type AdminPaymentsPort interface {
	AdminPayments(context.Context, []string) (map[string]AdminPaymentSummary, error)
	PaymentAttempts(context.Context, string) ([]AdminPaymentAttempt, error)
	PendingManualRefunds(context.Context) (int64, error)
}
type AdminImagesPort interface {
	OrderImages(context.Context, []string) (map[string]string, error)
}
type AdminShipmentsPort interface {
	Shipment(context.Context, string) (*AdminShipment, error)
}
