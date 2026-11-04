package domain

import (
	"context"
	"errors"
	"net/url"
	"regexp"
	"strings"
	"time"
)

var (
	ErrVersionConflict   = errors.New("version_conflict")
	ErrOrderNotFound     = errors.New("order_not_found")
	ErrInvalidTransition = errors.New("invalid_order_transition")
)

type ValidationError struct{ Field string }

func (e *ValidationError) Error() string { return "invalid shipment field: " + e.Field }

type Shipment struct {
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

type DispatchInput struct {
	OrderID, ActorID            string
	OrderVersion                int32
	ShipmentVersion             *int32
	CarrierName                 string
	TrackingNumber, TrackingURL *string
}

type ShipmentRepository interface {
	Dispatch(context.Context, DispatchInput, time.Time) (Shipment, error)
}

// OrderGuard holds the order's serialization boundary throughout the callback.
// Cancellation must take that same boundary and reject an already shipped shipment.
// The callback commits only shipping-owned data; orders converges via outbox.
type OrderGuard interface {
	WithDispatchOrder(context.Context, string, int32, func(context.Context) error) error
}

func ValidID(value string) bool {
	return regexp.MustCompile(`(?i)^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`).MatchString(value)
}

// NormalizeDispatch returns a copy and never changes caller-owned pointers.
func NormalizeDispatch(in DispatchInput) (DispatchInput, error) {
	if !ValidID(in.OrderID) {
		return in, &ValidationError{Field: "order_id"}
	}
	if !ValidID(in.ActorID) {
		return in, &ValidationError{Field: "actor_id"}
	}
	if in.OrderVersion < 1 {
		return in, ErrVersionConflict
	}
	if in.ShipmentVersion != nil && *in.ShipmentVersion < 1 {
		return in, &ValidationError{Field: "shipment_version"}
	}
	in.OrderID = strings.ToLower(in.OrderID)
	in.ActorID = strings.ToLower(in.ActorID)
	in.CarrierName = strings.TrimSpace(in.CarrierName)
	if in.CarrierName == "" {
		return in, &ValidationError{Field: "carrier_name"}
	}
	if in.TrackingNumber != nil {
		value := strings.TrimSpace(*in.TrackingNumber)
		in.TrackingNumber = nil
		if value != "" {
			in.TrackingNumber = &value
		}
	}
	if in.TrackingURL != nil {
		value := *in.TrackingURL
		u, err := url.Parse(value)
		if err != nil || u.Scheme != "https" || u.Hostname() == "" || u.Opaque != "" || strings.ContainsAny(value, " \t\r\n") {
			return in, &ValidationError{Field: "tracking_url"}
		}
	}
	return in, nil
}
