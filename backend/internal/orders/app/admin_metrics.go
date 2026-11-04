package app

import (
	"context"
	"github.com/freedomCruz/monte-luna/backend/internal/orders/domain"
	"sort"
)

func (s *AdminReads) Metrics(ctx context.Context, values map[string][]string, role string) (domain.AdminMetrics, error) {
	out := domain.AdminMetrics{TimeZone: "America/Bogota", GeneratedAt: s.now().UTC()}
	if role != "owner" && role != "staff" {
		return out, &domain.Error{Status: 403, Code: "forbidden"}
	}
	w, err := domain.ResolveMetricPeriod(values, out.GeneratedAt)
	if err != nil {
		return out, err
	}
	out.Period = w.Period
	out.From = w.From
	out.To = w.To
	out.PreviousFrom = w.PreviousFrom
	out.PreviousTo = w.PreviousTo
	out.Granularity = w.Granularity
	out.Series = w.Buckets
	type totals struct{ amount, count, units int64 }
	var current, previous totals
	from := w.PreviousFrom
	if w.From.Before(from) {
		from = w.From
	}
	err = s.repo.ScanAdminPaid(ctx, from, w.To, func(p domain.PaidOrder) error {
		var target *totals
		isPrevious := false
		at := p.At
		if !p.At.Before(w.From) && p.At.Before(w.To) {
			target = &current
		} else if !p.At.Before(w.PreviousFrom) && p.At.Before(w.PreviousTo) {
			target = &previous
			isPrevious = true
			at = domain.RelativeTime(w.From, p.At, w.PreviousFrom)
		}
		if target == nil {
			return nil
		}
		var err error
		target.amount, err = domain.Add(target.amount, p.Amount)
		if err != nil {
			return err
		}
		target.units, err = domain.Add(target.units, p.Units)
		if err != nil {
			return err
		}
		target.count++
		i := sort.Search(len(out.Series), func(i int) bool { return out.Series[i].To.After(at) })
		if i < len(out.Series) && !at.Before(out.Series[i].From) {
			if isPrevious {
				out.Series[i].PreviousSalesAmount, err = domain.Add(out.Series[i].PreviousSalesAmount, p.Amount)
			} else {
				out.Series[i].SalesAmount, err = domain.Add(out.Series[i].SalesAmount, p.Amount)
			}
		}
		return err
	})
	if err != nil {
		return out, err
	}
	out.KPIs = domain.AdminKPIs{PaidSales: domain.Comparison(current.amount, previous.amount), Orders: domain.Comparison(current.count, previous.count), Average: domain.Comparison(domain.Average(current.amount, current.count), domain.Average(previous.amount, previous.count)), Units: domain.Comparison(current.units, previous.units)}
	out.Attention.Role = role
	out.Attention.PendingDispatchCount, out.Attention.OldestPaidAt, err = s.repo.AdminAttention(ctx)
	if err != nil {
		return out, err
	}
	if role == "owner" {
		n, err := s.payments.PendingManualRefunds(ctx)
		if err != nil {
			return out, err
		}
		out.Attention.ManualRefundCount = &n
	}
	latest, err := s.list(ctx, domain.AdminFilter{Sort: "-placed_at", Limit: 6, MaxRows: 6})
	if err != nil {
		return out, err
	}
	out.LatestOrders = latest.Items
	return out, nil
}
