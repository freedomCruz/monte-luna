package orders

import (
	"context"
	"strings"

	"github.com/freedomCruz/monte-luna/backend/internal/orders/domain"
)

type OrderNotice = domain.OrderNotice

// OrderNotice is the public read other modules use to address customer email.
func (m *Module) OrderNotice(ctx context.Context, id string) (OrderNotice, error) {
	id = strings.ToLower(id)
	if _, err := domain.NormalizeKey(id); err != nil {
		return OrderNotice{}, domain.BadAdminQuery()
	}
	return m.repository.OrderNotice(ctx, id)
}
