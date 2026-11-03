package domain

// OrderNotice carries the customer contact for order emails. CancelReason is
// the latest admin cancellation note; system notes are internal and omitted.
type OrderNotice struct {
	OrderNumber, Email, Name string
	CancelReason             *string
}
