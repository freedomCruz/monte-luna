package postgres

import (
	"context"
	"errors"
	"fmt"
	"time"

	orderssql "github.com/freedomCruz/monte-luna/backend/internal/orders/adapters/postgres/sqlc"
	"github.com/freedomCruz/monte-luna/backend/internal/orders/domain"
	"github.com/jackc/pgx/v5"
)

func rollback(ctx context.Context, tx pgx.Tx, err *error) {
	if e := tx.Rollback(ctx); e != nil && !errors.Is(e, pgx.ErrTxClosed) {
		*err = errors.Join(*err, e)
	}
}
func (r *Repository) Track(ctx context.Context, hash string) (guest domain.GuestOrder, err error) {
	tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.RepeatableRead, AccessMode: pgx.ReadOnly})
	if err != nil {
		return guest, fmt.Errorf("begin tracking read: %w", err)
	}
	defer rollback(ctx, tx, &err)
	q := orderssql.New(tx)
	order, err := q.GetOrderByTrackingHash(ctx, hash)
	if errors.Is(err, pgx.ErrNoRows) {
		return guest, &domain.Error{Status: 404, Code: "order_not_found"}
	}
	if err != nil {
		return guest, fmt.Errorf("read guest order: %w", err)
	}
	address, err := q.GetShippingAddress(ctx, order.ID)
	if err != nil {
		return guest, fmt.Errorf("read guest address: %w", err)
	}
	lines, err := q.ReadGuestLines(ctx, order.ID)
	if err != nil {
		return guest, fmt.Errorf("read guest lines: %w", err)
	}
	guest = domain.GuestOrder{OrderNumber: order.OrderNumber, Status: order.Status, PlacedAt: order.PlacedAt.Time.UTC(), ReservationExpiresAt: order.ReservationExpiresAt.Time.UTC(), SubtotalAmount: order.SubtotalAmount, ShippingAmount: order.ShippingAmount, TaxAmount: order.TaxAmount, TotalAmount: order.TotalAmount, Shipping: domain.Shipping{RateName: order.ShippingRateName, Amount: order.ShippingAmount, IsFreeShipping: order.ShippingIsFreeShipping, EstimatedDaysMin: order.ShippingEstimatedDaysMin, EstimatedDaysMax: order.ShippingEstimatedDaysMax}, Address: domain.GuestAddress{RecipientName: address.RecipientName, RecipientPhone: address.Phone, MunicipalityCode: address.MunicipalityCode, MunicipalityName: address.MunicipalityName, DepartmentName: address.DepartmentName, AddressLine1: address.AddressLine1, AddressLine2: address.AddressLine2, DeliveryNotes: address.DeliveryNotes}, Lines: make([]domain.GuestLine, 0, len(lines))}
	for _, line := range lines {
		var date *string
		if line.ProductionDate.Valid {
			s := line.ProductionDate.Time.Format("2006-01-02")
			date = &s
		}
		guest.Lines = append(guest.Lines, domain.GuestLine{Line: domain.Line{VariantID: line.VariantID, ProductSlug: line.ProductSlug, ProductTitle: line.ProductTitle, VariantLabel: line.VariantLabel, SKU: line.Sku, UnitPriceAmount: line.UnitPriceAmount, Quantity: line.Quantity, LineTotalAmount: line.LineTotalAmount}, ProductionDate: date})
	}
	return guest, nil
}
func (r *Repository) Expire(ctx context.Context, now time.Time, release func(context.Context, string) error) (int, error) {
	count := 0
	for range 100 {
		changed, err := r.expireOne(ctx, now, release)
		if err != nil {
			return count, err
		}
		if !changed {
			break
		}
		count++
	}
	return count, nil
}
func (r *Repository) expireOne(ctx context.Context, now time.Time, release func(context.Context, string) error) (changed bool, err error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return false, fmt.Errorf("begin expiry: %w", err)
	}
	defer rollback(ctx, tx, &err)
	q := orderssql.New(tx)
	order, err := q.LockExpiredOrder(ctx, stamp(now))
	if errors.Is(err, pgx.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, fmt.Errorf("lock expired order: %w", err)
	}
	if !domain.ReservationExpired(order.Status, order.ReservationExpiresAt.Time, now) {
		return false, nil
	}
	// Keep the order row locked while the idempotent catalog release commits.
	// If order persistence then fails/crashes, the next run repeats a harmless
	// release and completes the expired/history/outbox transaction.
	if err := release(ctx, order.ID); err != nil {
		return false, fmt.Errorf("release expired reservation: %w", err)
	}
	n, err := q.SetOrderExpired(ctx, orderssql.SetOrderExpiredParams{ID: order.ID, UpdatedAt: stamp(now)})
	if err != nil {
		return false, err
	}
	if n != 1 {
		return false, fmt.Errorf("expired order state conflict")
	}
	from := "pending_payment"
	if err := q.InsertOrderHistory(ctx, orderssql.InsertOrderHistoryParams{OrderID: order.ID, FromStatus: &from, ToStatus: "expired", CreatedAt: stamp(now)}); err != nil {
		return false, err
	}
	payload := []byte(fmt.Sprintf(`{"order_id":%q,"order_number":%q,"expired_at":%q}`, order.ID, order.OrderNumber, now.UTC().Format(time.RFC3339Nano)))
	if err := q.InsertOrderEvent(ctx, orderssql.InsertOrderEventParams{Type: "orders.order_expired", OccurredAt: stamp(now), Payload: payload}); err != nil {
		return false, err
	}
	if err := tx.Commit(ctx); err != nil {
		return false, fmt.Errorf("commit expiry: %w", err)
	}
	return true, nil
}
func (r *Repository) Cleanup(ctx context.Context, now time.Time) error {
	if _, err := orderssql.New(r.pool).CleanupIdempotency(ctx, stamp(now)); err != nil {
		return fmt.Errorf("cleanup idempotency keys: %w", err)
	}
	return nil
}
