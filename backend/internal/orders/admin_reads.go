package orders

import (
	"context"
	"errors"
	"strings"

	"github.com/freedomCruz/monte-luna/backend/internal/orders/app"
	"github.com/freedomCruz/monte-luna/backend/internal/orders/domain"
)

type AdminPaymentSummary = domain.AdminPaymentSummary
type AdminPaymentAttempt = domain.AdminPaymentAttempt
type AdminShipment = domain.AdminShipment
type AdminOrder = domain.AdminOrder
type AdminOrderPage = domain.AdminOrderPage
type AdminMetrics = domain.AdminMetrics
type AdminPaymentsPort = domain.AdminPaymentsPort
type AdminImagesPort = domain.AdminImagesPort
type AdminShipmentsPort = domain.AdminShipmentsPort

// Configure before serving; callers of these internal ports own authorization.
func (m *Module) EnableAdminReads(p AdminPaymentsPort, i AdminImagesPort, s AdminShipmentsPort) error {
	if p == nil || i == nil || s == nil || m.repository == nil || m.clock == nil {
		return errors.New("orders admin read dependencies are required")
	}
	m.adminReads = app.NewAdminReads(m.repository, p, i, s, m.clock.Now)
	m.shipments = s
	return nil
}
func (m *Module) ListAdminOrders(ctx context.Context, values map[string][]string) (AdminOrderPage, error) {
	if m.adminReads == nil {
		return AdminOrderPage{}, errors.New("orders admin reads not configured")
	}
	return m.adminReads.List(ctx, values)
}
func (m *Module) AdminMetrics(ctx context.Context, values map[string][]string, role string) (AdminMetrics, error) {
	if m.adminReads == nil {
		return AdminMetrics{}, errors.New("orders admin reads not configured")
	}
	return m.adminReads.Metrics(ctx, values, role)
}
func (m *Module) AdminOrder(ctx context.Context, id string) (AdminOrder, error) {
	if m.adminReads == nil {
		return AdminOrder{}, errors.New("orders admin reads not configured")
	}
	return m.adminReads.Detail(ctx, strings.ToLower(id))
}
