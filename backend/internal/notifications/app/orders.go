package app

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"time"

	"github.com/freedomCruz/monte-luna/backend/internal/notifications/domain"
)

// OrderConsumer emails customers about shipments and cancellations. It runs
// after the business transaction committed, so its failures only retry email.
type OrderConsumer struct {
	store    domain.DeliveryRepository
	renderer domain.Renderer
	sender   domain.EmailSender
	orders   domain.OrderContacts
	now      func() time.Time
}

func NewOrderConsumer(store domain.DeliveryRepository, renderer domain.Renderer, sender domain.EmailSender, orders domain.OrderContacts, now func() time.Time) *OrderConsumer {
	return &OrderConsumer{store: store, renderer: renderer, sender: sender, orders: orders, now: now}
}

func (c *OrderConsumer) Handle(ctx context.Context, event domain.Event) error {
	if c.store == nil || c.renderer == nil || c.sender == nil || c.orders == nil || c.now == nil {
		return errors.New("order notification consumer is not configured")
	}
	key := ""
	switch event.Type {
	case "shipping.shipment_shipped":
		key = "order_shipped"
	case "orders.order_cancelled":
		key = "order_cancelled"
	default:
		return ErrInvalidEvent
	}
	var payload struct {
		OrderID        string  `json:"order_id"`
		CarrierName    string  `json:"carrier_name"`
		TrackingNumber *string `json:"tracking_number"`
		TrackingURL    *string `json:"tracking_url"`
	}
	if err := json.Unmarshal(event.Payload, &payload); err != nil || !domain.ValidOrderID(payload.OrderID) {
		return ErrInvalidEvent
	}
	if key == "order_shipped" && strings.TrimSpace(payload.CarrierName) == "" {
		return ErrInvalidEvent
	}
	contact, err := c.orders.OrderContact(ctx, payload.OrderID)
	if err != nil {
		return err
	}
	input := domain.Intake{SourceEventID: event.ID, EventType: event.Type, TemplateKey: key, RecipientEmail: contact.Email, TemplateData: domain.TemplateData{OrderID: payload.OrderID}}
	if input.Validate() != nil {
		return ErrInvalidEvent
	}
	message, err := c.store.Intake(ctx, input, c.now())
	if err != nil {
		return ErrPersistence
	}
	if message.Status != "pending" && message.Status != "failed" {
		return nil
	}
	fail := func() error {
		if err := c.store.RecordFailure(ctx, message.ID, c.now()); err != nil {
			return ErrPersistence
		}
		return ErrDelivery
	}
	if message.RecipientEmail == nil {
		return fail()
	}
	view := domain.TemplateView{DisplayName: contact.Name, OrderNumber: contact.OrderNumber}
	if key == "order_shipped" {
		view.CarrierName = payload.CarrierName
		view.TrackingNumber = optional(payload.TrackingNumber)
		view.TrackingURL = optional(payload.TrackingURL)
	} else {
		view.Reason = optional(contact.CancelReason)
	}
	email, err := c.renderer.Render(ctx, key, view)
	if err != nil {
		return fail()
	}
	email.MessageID = message.ID
	email.Recipient = *message.RecipientEmail
	suppressed, err := c.store.IsSuppressed(ctx, email.Recipient)
	if err != nil {
		return ErrPersistence
	}
	if suppressed {
		// Intake re-marks the pending row suppressed without sending.
		if _, err := c.store.Intake(ctx, input, c.now()); err != nil {
			return ErrPersistence
		}
		return nil
	}
	result, err := c.sender.Send(ctx, email)
	if err != nil || result.Provider == "" || result.MessageID == "" {
		return fail()
	}
	if err := c.store.RecordSent(ctx, message.ID, result, c.now()); err != nil {
		return ErrPersistence
	}
	return nil
}

func optional(value *string) string {
	if value == nil {
		return ""
	}
	return strings.TrimSpace(*value)
}
