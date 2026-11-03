package app

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"slices"
	"strings"
	"time"

	"github.com/freedomCruz/monte-luna/backend/internal/orders/domain"
)

type AdminReads struct {
	repo      domain.AdminReadRepository
	payments  domain.AdminPaymentsPort
	images    domain.AdminImagesPort
	shipments domain.AdminShipmentsPort
	now       func() time.Time
}

func NewAdminReads(repo domain.AdminReadRepository, p domain.AdminPaymentsPort, i domain.AdminImagesPort, s domain.AdminShipmentsPort, now func() time.Time) *AdminReads {
	return &AdminReads{repo, p, i, s, now}
}

type adminCursor struct {
	Filter string    `json:"filter"`
	At     time.Time `json:"at"`
	ID     string    `json:"id"`
}

func (s *AdminReads) List(ctx context.Context, values map[string][]string) (domain.AdminOrderPage, error) {
	f, err := domain.ParseAdminFilter(values, s.now())
	if err != nil {
		return domain.AdminOrderPage{}, err
	}
	return s.list(ctx, f)
}
func (s *AdminReads) list(ctx context.Context, f domain.AdminFilter) (domain.AdminOrderPage, error) {
	page := domain.AdminOrderPage{Items: []domain.AdminOrderRow{}}
	var cursor *adminCursor
	if f.Cursor != "" {
		data, err := base64.RawURLEncoding.DecodeString(f.Cursor)
		if err != nil || len(data) > 2048 {
			return page, domain.BadAdminQuery()
		}
		var c adminCursor
		if json.Unmarshal(data, &c) != nil || c.Filter != f.Fingerprint || c.At.IsZero() {
			return page, domain.BadAdminQuery()
		}
		if _, err := domain.NormalizeKey(c.ID); err != nil {
			return page, domain.BadAdminQuery()
		}
		cursor = &c
	}
	after := 0
	err := s.repo.ScanAdminRows(ctx, f, func(rows []domain.AdminOrderRow) error {
		summaries := map[string]domain.AdminPaymentSummary{}
		if len(f.Methods) > 0 || len(page.Items) < f.Limit {
			ids := make([]string, len(rows))
			for i, row := range rows {
				ids[i] = row.ID
			}
			var err error
			summaries, err = s.payments.AdminPayments(ctx, ids)
			if err != nil {
				return err
			}
		}
		for _, row := range rows {
			if p, ok := summaries[row.ID]; ok {
				row.Payment = &p
			}
			if len(f.Methods) > 0 && (row.Payment == nil || row.Payment.Method == nil || !slices.Contains(f.Methods, *row.Payment.Method)) {
				continue
			}
			page.Total++
			if cursor != nil {
				cmp := row.PlacedAt.Compare(cursor.At)
				if cmp == 0 {
					cmp = strings.Compare(row.ID, cursor.ID)
				}
				if (f.Sort == "placed_at" && cmp <= 0) || (f.Sort == "-placed_at" && cmp >= 0) {
					continue
				}
			}
			after++
			if len(page.Items) < f.Limit {
				page.Items = append(page.Items, row)
			}
		}
		return nil
	})
	if err != nil {
		return page, err
	}
	page.PendingDispatchCount, _, err = s.repo.AdminAttention(ctx)
	if err != nil {
		return page, err
	}
	if after > f.Limit && len(page.Items) > 0 {
		last := page.Items[len(page.Items)-1]
		data, err := json.Marshal(adminCursor{f.Fingerprint, last.PlacedAt, last.ID})
		if err != nil {
			return page, err
		}
		v := base64.RawURLEncoding.EncodeToString(data)
		page.NextCursor = &v
	}
	return page, nil
}
func (s *AdminReads) Detail(ctx context.Context, id string) (domain.AdminOrder, error) {
	if _, err := domain.NormalizeKey(id); err != nil {
		return domain.AdminOrder{}, domain.BadAdminQuery()
	}
	out, err := s.repo.ReadAdminOrder(ctx, id)
	if err != nil {
		return out, err
	}
	summaries, err := s.payments.AdminPayments(ctx, []string{id})
	if err != nil {
		return out, err
	}
	if p, ok := summaries[id]; ok {
		out.Payment = &p
	}
	out.Attempts, err = s.payments.PaymentAttempts(ctx, id)
	if err != nil {
		return out, err
	}
	if out.Attempts == nil {
		out.Attempts = []domain.AdminPaymentAttempt{}
	}
	ids := make([]string, 0, len(out.Lines))
	for _, line := range out.Lines {
		ids = append(ids, line.ProductID)
	}
	images, err := s.images.OrderImages(ctx, ids)
	if err != nil {
		return out, err
	}
	for i := range out.Lines {
		if url, ok := images[out.Lines[i].ProductID]; ok {
			v := url
			out.Lines[i].ImageURL = &v
		}
	}
	out.Shipment, err = s.shipments.Shipment(ctx, id)
	return out, err
}
