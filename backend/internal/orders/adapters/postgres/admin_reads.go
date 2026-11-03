package postgres

import (
	"context"
	"errors"
	"time"

	"github.com/freedomCruz/monte-luna/backend/internal/orders/domain"
	"github.com/jackc/pgx/v5"
)

// ScanAdminRows streams bounded batches. Payment filtering composes through its
// public port in the application, never by querying the payments schema.
func (r *Repository) ScanAdminRows(ctx context.Context, f domain.AdminFilter, visit func([]domain.AdminOrderRow) error) error {
	direction := "DESC"
	if f.Sort == "placed_at" {
		direction = "ASC"
	}
	rows, err := r.pool.Query(ctx, `SELECT o.id::text,o.order_number,o.placed_at,o.customer_name,o.customer_email,
 COALESCE(a.municipality_name,''),COALESCE(a.department_name,''),o.total_amount,o.status
 FROM orders.orders o LEFT JOIN orders.order_shipping_addresses a ON a.order_id=o.id
 WHERE ($1::text='' OR strpos(lower(o.order_number),lower($1))>0 OR strpos(lower(o.customer_name),lower($1))>0 OR strpos(lower(o.customer_email),lower($1))>0)
 AND (COALESCE(cardinality($2::text[]),0)=0 OR o.status=ANY($2::text[]))
 AND ($3::timestamptz IS NULL OR o.placed_at >= $3) AND ($4::timestamptz IS NULL OR o.placed_at < $4)
 AND (NOT $5::boolean OR o.status IN ('paid','preparing'))
 ORDER BY o.placed_at `+direction+`,o.id `+direction, f.Search, f.Statuses, f.From, f.To, f.Pending)
	if err != nil {
		return err
	}
	defer rows.Close()
	batch := make([]domain.AdminOrderRow, 0, 100)
	for rows.Next() {
		var row domain.AdminOrderRow
		if err := rows.Scan(&row.ID, &row.Number, &row.PlacedAt, &row.CustomerName, &row.CustomerEmail, &row.MunicipalityName, &row.DepartmentName, &row.TotalAmount, &row.Status); err != nil {
			return err
		}
		row.PlacedAt = row.PlacedAt.UTC()
		batch = append(batch, row)
		if len(batch) == 100 {
			if err := visit(batch); err != nil {
				return err
			}
			batch = make([]domain.AdminOrderRow, 0, 100)
		}
	}
	if err := rows.Err(); err != nil {
		return err
	}
	if len(batch) > 0 {
		return visit(batch)
	}
	return nil
}
func (r *Repository) AdminAttention(ctx context.Context) (int64, *time.Time, error) {
	var n int64
	var at *time.Time
	err := r.pool.QueryRow(ctx, `SELECT count(*),min(paid_at) FROM orders.orders WHERE status IN ('paid','preparing')`).Scan(&n, &at)
	if at != nil {
		v := at.UTC()
		at = &v
	}
	return n, at, err
}
func utcPointer(at *time.Time) *time.Time {
	if at == nil {
		return nil
	}
	v := at.UTC()
	return &v
}
func (r *Repository) ReadAdminOrder(ctx context.Context, id string) (out domain.AdminOrder, err error) {
	tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.RepeatableRead, AccessMode: pgx.ReadOnly})
	if err != nil {
		return out, err
	}
	defer rollback(ctx, tx, &err)
	s := &out.Summary
	b := &s.Shipping
	err = tx.QueryRow(ctx, `SELECT id::text,order_number,status,placed_at,paid_at,cancelled_at,customer_email,customer_name,customer_phone,version,
 subtotal_amount,discount_amount,coupon_code,shipping_amount,shipping_discount_amount,tax_amount,total_amount,
 shipping_rate_name,shipping_zone_name,shipping_min_weight_grams,shipping_max_weight_grams,shipping_estimated_days_min,shipping_estimated_days_max
 FROM orders.orders WHERE id=$1`, id).Scan(&out.ID, &out.Number, &out.Status, &out.PlacedAt, &out.PaidAt, &out.CancelledAt, &out.Customer.Email, &out.Customer.FullName, &out.Customer.Phone, &out.Version,
		&s.SubtotalAmount, &s.DiscountAmount, &s.CouponCode, &s.ShippingAmount, &s.ShippingDiscountAmount, &s.TaxAmount, &s.TotalAmount, &b.RateName, &b.ZoneName, &b.MinWeightGrams, &b.MaxWeightGrams, &b.EstimatedDaysMin, &b.EstimatedDaysMax)
	if errors.Is(err, pgx.ErrNoRows) {
		return out, &domain.Error{Status: 404, Code: "order_not_found"}
	}
	if err != nil {
		return out, err
	}
	out.PlacedAt = out.PlacedAt.UTC()
	out.PaidAt = utcPointer(out.PaidAt)
	out.CancelledAt = utcPointer(out.CancelledAt)
	a := &out.Address
	err = tx.QueryRow(ctx, `SELECT recipient_name,phone,municipality_code,municipality_name,department_name,address_line1,address_line2,postal_code,delivery_notes FROM orders.order_shipping_addresses WHERE order_id=$1`, id).Scan(&a.RecipientName, &a.RecipientPhone, &a.MunicipalityCode, &a.MunicipalityName, &a.DepartmentName, &a.AddressLine1, &a.AddressLine2, &a.PostalCode, &a.DeliveryNotes)
	if err != nil {
		return out, err
	}
	out.Lines = []domain.AdminOrderLine{}
	out.History = []domain.AdminHistory{}
	out.Attempts = []domain.AdminPaymentAttempt{}
	rows, err := tx.Query(ctx, `SELECT id::text,variant_id::text,product_id::text,product_slug,product_title,variant_label,sku,unit_price_amount,quantity,line_total_amount,discount_amount,tax_amount FROM orders.order_lines WHERE order_id=$1 ORDER BY created_at,id`, id)
	if err != nil {
		return out, err
	}
	indexes := map[string]int{}
	for rows.Next() {
		var line domain.AdminOrderLine
		line.LotAllocations = []domain.AdminLotAllocation{}
		if err := rows.Scan(&line.ID, &line.VariantID, &line.ProductID, &line.ProductSlug, &line.ProductTitle, &line.VariantLabel, &line.SKU, &line.UnitPriceAmount, &line.Quantity, &line.LineTotalAmount, &line.DiscountAmount, &line.TaxAmount); err != nil {
			rows.Close()
			return out, err
		}
		indexes[line.ID] = len(out.Lines)
		out.Lines = append(out.Lines, line)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return out, err
	}
	rows, err = tx.Query(ctx, `SELECT a.order_line_id::text,a.lot_id::text,a.lot_code,to_char(a.production_date,'YYYY-MM-DD'),a.quantity FROM orders.order_line_lot_allocations a JOIN orders.order_lines l ON l.id=a.order_line_id WHERE l.order_id=$1 ORDER BY a.created_at,a.id`, id)
	if err != nil {
		return out, err
	}
	for rows.Next() {
		var lineID string
		var lot domain.AdminLotAllocation
		if err := rows.Scan(&lineID, &lot.LotID, &lot.LotCode, &lot.ProductionDate, &lot.Quantity); err != nil {
			rows.Close()
			return out, err
		}
		i := indexes[lineID]
		out.Lines[i].LotAllocations = append(out.Lines[i].LotAllocations, lot)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return out, err
	}
	rows, err = tx.Query(ctx, `SELECT id::text,from_status,to_status,actor_type,actor_id::text,note,created_at FROM orders.order_status_history WHERE order_id=$1 ORDER BY created_at,id`, id)
	if err != nil {
		return out, err
	}
	for rows.Next() {
		var h domain.AdminHistory
		if err := rows.Scan(&h.ID, &h.FromStatus, &h.ToStatus, &h.ActorType, &h.ActorID, &h.Note, &h.CreatedAt); err != nil {
			rows.Close()
			return out, err
		}
		h.CreatedAt = h.CreatedAt.UTC()
		out.History = append(out.History, h)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return out, err
	}
	return out, nil
}
