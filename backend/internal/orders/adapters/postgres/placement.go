package postgres

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	orderssql "github.com/freedomCruz/monte-luna/backend/internal/orders/adapters/postgres/sqlc"
	"github.com/freedomCruz/monte-luna/backend/internal/orders/domain"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Repository struct {
	pool     *pgxpool.Pool
	payments domain.PaymentsPort
}

func (r *Repository) EnablePayments(port domain.PaymentsPort) { r.payments = port }

func NewRepository(pool *pgxpool.Pool) *Repository { return &Repository{pool: pool} }

type placementTx struct {
	tx           pgx.Tx
	q            *orderssql.Queries
	key, orderID string
	pool         *pgxpool.Pool
}

func stamp(t time.Time) pgtype.Timestamptz { return pgtype.Timestamptz{Time: t, Valid: true} }
func (r *Repository) BeginPlacement(ctx context.Context, key string) (domain.PlacementTx, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("begin order placement: %w", err)
	}
	q := orderssql.New(tx)
	if err := q.LockIdempotencyKey(ctx, key); err != nil {
		_ = tx.Rollback(ctx)
		return nil, fmt.Errorf("lock placement key: %w", err)
	}
	return &placementTx{tx: tx, q: q, key: key, pool: r.pool}, nil
}
func (t *placementTx) Replay(ctx context.Context, hash string, now time.Time) (*domain.PlacedOrder, error) {
	row, err := t.q.GetIdempotency(ctx, t.key)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("read idempotency result: %w", err)
	}
	if !row.ExpiresAt.Time.After(now) || row.RequestHash != hash {
		return nil, &domain.Error{Status: 422, Code: "idempotency_key_reused"}
	}
	var result domain.PlacedOrder
	if err := json.Unmarshal(row.ResponseBody, &result); err != nil {
		return nil, fmt.Errorf("decode placement result: %w", err)
	}
	return &result, nil
}
func (t *placementTx) TokenExists(ctx context.Context, hash string) (bool, error) {
	return t.q.TrackingHashExists(ctx, hash)
}
func (t *placementTx) NewID(ctx context.Context) (string, error) { return t.q.NewOrderID(ctx) }
func (t *placementTx) Rollback(ctx context.Context) error {
	err := t.tx.Rollback(ctx)
	if errors.Is(err, pgx.ErrTxClosed) {
		return nil
	}
	return err
}
func (t *placementTx) Commit(ctx context.Context) error {
	err := t.tx.Commit(ctx)
	if err == nil {
		return nil
	}
	if errors.Is(err, pgx.ErrTxCommitRollback) {
		return err
	}
	// Fence on the same key in a fresh transaction: acquiring this lock proves
	// the original transaction has ended, even if its COMMIT response was lost.
	// A stored result proves success; absence proves it is safe to compensate.
	recovery, cancel := context.WithTimeout(context.WithoutCancel(ctx), 10*time.Second)
	defer cancel()
	probe, probeErr := t.pool.Begin(recovery)
	if probeErr != nil {
		return errors.Join(domain.ErrCommitUncertain, err, probeErr)
	}
	defer func() { _ = probe.Rollback(recovery) }()
	queries := orderssql.New(probe)
	if lockErr := queries.LockIdempotencyKey(recovery, t.key); lockErr != nil {
		return errors.Join(domain.ErrCommitUncertain, err, lockErr)
	}
	record, readErr := queries.GetIdempotency(recovery, t.key)
	if readErr == nil && record.OrderID == t.orderID {
		return nil
	}
	if errors.Is(readErr, pgx.ErrNoRows) {
		return err
	}
	return errors.Join(domain.ErrCommitUncertain, err, readErr)
}
func (t *placementTx) Save(ctx context.Context, order domain.Order) error {
	if _, err := t.tx.Exec(ctx, "SAVEPOINT order_number_attempt"); err != nil {
		return fmt.Errorf("create order savepoint: %w", err)
	}
	profile, err := json.Marshal(struct {
		Country        string  `json:"country"`
		LegalForm      string  `json:"legal_form"`
		TaxRegime      *string `json:"tax_regime"`
		VATResponsible bool    `json:"vat_responsible"`
	}{order.Quote.FiscalProfile.Country, order.Quote.FiscalProfile.LegalForm, order.Quote.FiscalProfile.TaxRegime, order.Quote.FiscalProfile.VATResponsible})
	if err != nil {
		return err
	}
	var person, document, number *string
	if order.Request.Fiscal != nil {
		person = &order.Request.Fiscal.PersonType
		document = &order.Request.Fiscal.DocumentType
		number = &order.Request.Fiscal.DocumentNumber
	}
	err = t.q.InsertOrder(ctx, orderssql.InsertOrderParams{ID: order.ID, OrderNumber: order.Number, SubtotalAmount: order.Quote.SubtotalAmount, ShippingAmount: order.Quote.ShippingAmount, TaxAmount: order.Quote.TaxAmount, TotalAmount: order.Quote.TotalAmount, ShippingRateName: order.Quote.Shipping.RateName, ShippingIsFreeShipping: order.Quote.Shipping.IsFreeShipping, ShippingEstimatedDaysMin: order.Quote.Shipping.EstimatedDaysMin, ShippingEstimatedDaysMax: order.Quote.Shipping.EstimatedDaysMax, CustomerEmail: strings.ToLower(order.Request.Customer.Email), CustomerName: order.Request.Customer.FullName, CustomerPhone: order.Request.Customer.Phone, BuyerPersonType: person, BuyerDocumentType: document, BuyerDocumentNumber: number, FiscalProfileSnapshot: profile, TrackingTokenHash: order.TokenHash, ReservationExpiresAt: stamp(order.ExpiresAt), PlacedAt: stamp(order.PlacedAt)})
	if err != nil {
		var constraint *pgconn.PgError
		if errors.As(err, &constraint) && constraint.Code == "23505" && constraint.ConstraintName == "orders_order_number_key" {
			if _, rollbackErr := t.tx.Exec(ctx, "ROLLBACK TO SAVEPOINT order_number_attempt"); rollbackErr != nil {
				return errors.Join(err, rollbackErr)
			}
			if _, releaseErr := t.tx.Exec(ctx, "RELEASE SAVEPOINT order_number_attempt"); releaseErr != nil {
				return releaseErr
			}
			return domain.ErrOrderNumberCollision
		}
		return fmt.Errorf("persist order: %w", err)
	}
	for _, line := range order.Quote.Lines {
		lineID, err := t.q.InsertOrderLine(ctx, orderssql.InsertOrderLineParams{OrderID: order.ID, ProductID: line.ProductID, VariantID: line.VariantID, Sku: line.SKU, ProductSlug: line.ProductSlug, ProductTitle: line.ProductTitle, VariantLabel: line.VariantLabel, UnitPriceAmount: line.UnitPriceAmount, Quantity: line.Quantity, TaxCategory: line.Tax.Category, TaxRateBps: line.Tax.RateBPS, TaxAmount: line.Tax.Amount, LineTotalAmount: line.LineTotalAmount, WeightGrams: line.WeightGrams})
		if err != nil {
			return fmt.Errorf("persist order line: %w", err)
		}
		for _, allocation := range order.Allocations {
			if allocation.VariantID != line.VariantID {
				continue
			}
			date, err := time.Parse("2006-01-02", allocation.ProductionDate)
			if err != nil {
				return err
			}
			if err := t.q.InsertAllocation(ctx, orderssql.InsertAllocationParams{OrderLineID: lineID, LotID: allocation.LotID, LotCode: allocation.LotCode, ProductionDate: pgtype.Date{Time: date, Valid: true}, Quantity: allocation.Quantity}); err != nil {
				return fmt.Errorf("persist allocation snapshot: %w", err)
			}
		}
	}
	a := order.Request.Address
	if err := t.q.InsertShippingAddress(ctx, orderssql.InsertShippingAddressParams{OrderID: order.ID, RecipientName: a.RecipientName, Phone: a.RecipientPhone, AddressLine1: a.AddressLine1, AddressLine2: a.AddressLine2, DepartmentName: a.DepartmentName, MunicipalityCode: a.MunicipalityCode, MunicipalityName: a.MunicipalityName, PostalCode: a.PostalCode, DeliveryNotes: a.DeliveryNotes}); err != nil {
		return fmt.Errorf("persist address snapshot: %w", err)
	}
	if err := t.q.InsertOrderHistory(ctx, orderssql.InsertOrderHistoryParams{OrderID: order.ID, ToStatus: "pending_payment", CreatedAt: stamp(order.PlacedAt)}); err != nil {
		return fmt.Errorf("persist placement history: %w", err)
	}
	payload, err := json.Marshal(struct {
		OrderID              string    `json:"order_id"`
		OrderNumber          string    `json:"order_number"`
		CustomerEmail        string    `json:"customer_email"`
		TotalAmount          int64     `json:"total_amount"`
		Currency             string    `json:"currency"`
		ReservationExpiresAt time.Time `json:"reservation_expires_at"`
	}{order.ID, order.Number, strings.ToLower(order.Request.Customer.Email), order.Quote.TotalAmount, "COP", order.ExpiresAt})
	if err != nil {
		return err
	}
	if err := t.q.InsertOrderEvent(ctx, orderssql.InsertOrderEventParams{Type: "orders.order_placed", OccurredAt: stamp(order.PlacedAt), Payload: payload}); err != nil {
		return fmt.Errorf("persist placed outbox event: %w", err)
	}
	response, err := json.Marshal(domain.PlacedOrder{OrderID: order.ID, OrderNumber: order.Number, Status: "pending_payment", TotalAmount: order.Quote.TotalAmount, ReservationExpiresAt: order.ExpiresAt})
	if err != nil {
		return err
	}
	if err := t.q.InsertIdempotency(ctx, orderssql.InsertIdempotencyParams{Key: order.Key, RequestHash: order.RequestHash, OrderID: order.ID, ResponseBody: response, CreatedAt: stamp(order.PlacedAt), ExpiresAt: stamp(order.PlacedAt.Add(24 * time.Hour))}); err != nil {
		return fmt.Errorf("persist idempotency result: %w", err)
	}
	if _, err := t.tx.Exec(ctx, "RELEASE SAVEPOINT order_number_attempt"); err != nil {
		return fmt.Errorf("release placement savepoint: %w", err)
	}
	t.orderID = order.ID
	return nil
}
