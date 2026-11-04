package orders

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"regexp"
	"time"

	"github.com/freedomCruz/monte-luna/backend/internal/identity"
	"github.com/freedomCruz/monte-luna/backend/internal/orders/adapters"
	"github.com/freedomCruz/monte-luna/backend/internal/orders/app"
	"github.com/freedomCruz/monte-luna/backend/internal/platform"
)

var eventUUID = regexp.MustCompile(`^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`)

// RegisterAdminWriteRoutes requires EnableAdminReads first: every write
// answers with the refreshed admin order read model.
func (m *Module) RegisterAdminWriteRoutes(mux *http.ServeMux, access identity.AccessChecker, sessions func(http.Handler) http.Handler) error {
	if mux == nil || sessions == nil {
		return errors.New("orders admin route dependencies required")
	}
	writes, err := app.NewAdminWrites(m.repository, m.inventory, m.shipments, m.adminReads, m.clock.Now)
	if err != nil {
		return err
	}
	handler, err := adapters.NewAdminWriteHTTP(writes, access)
	if err != nil {
		return err
	}
	handler.RegisterRoutes(mux, sessions)
	return nil
}

// HandleShipmentShipped advances the order once per shipping event; the
// shipment actor is recorded as the admin who moved the order.
func (m *Module) HandleShipmentShipped(ctx context.Context, event platform.Event) error {
	var body struct {
		OrderID   string    `json:"order_id"`
		ActorID   string    `json:"actor_id"`
		ShippedAt time.Time `json:"shipped_at"`
	}
	if event.Type != "shipping.shipment_shipped" || !eventUUID.MatchString(event.ID) {
		return errors.New("invalid shipment shipped event envelope")
	}
	if err := json.Unmarshal(event.Payload, &body); err != nil {
		return err
	}
	if !eventUUID.MatchString(body.OrderID) || !eventUUID.MatchString(body.ActorID) || body.ShippedAt.IsZero() {
		return errors.New("invalid shipment shipped event payload")
	}
	return m.repository.ShipmentShipped(ctx, event.ID, body.OrderID, body.ActorID, body.ShippedAt.UTC())
}
