package domain

import (
	"time"
)

type AdminComparison struct {
	Value    int64    `json:"value"`
	Previous int64    `json:"previous_value"`
	Delta    *float64 `json:"delta_percentage"`
}
type AdminKPIs struct {
	PaidSales AdminComparison `json:"paid_sales_amount"`
	Orders    AdminComparison `json:"orders"`
	Average   AdminComparison `json:"average_order_amount"`
	Units     AdminComparison `json:"units_sold"`
}
type AdminSalesBucket struct {
	From                time.Time `json:"from_at"`
	To                  time.Time `json:"to_at"`
	PreviousFrom        time.Time `json:"previous_from_at"`
	PreviousTo          time.Time `json:"previous_to_at"`
	SalesAmount         int64     `json:"sales_amount"`
	PreviousSalesAmount int64     `json:"previous_sales_amount"`
}
type AdminAttention struct {
	Role                 string     `json:"role"`
	PendingDispatchCount int64      `json:"pending_dispatch_count"`
	OldestPaidAt         *time.Time `json:"oldest_pending_dispatch_paid_at"`
	ManualRefundCount    *int64     `json:"manual_refund_count"`
}
type AdminMetrics struct {
	Period       string             `json:"period"`
	GeneratedAt  time.Time          `json:"generated_at"`
	TimeZone     string             `json:"time_zone"`
	From         time.Time          `json:"from_at"`
	To           time.Time          `json:"to_at"`
	PreviousFrom time.Time          `json:"previous_from_at"`
	PreviousTo   time.Time          `json:"previous_to_at"`
	Granularity  string             `json:"granularity"`
	KPIs         AdminKPIs          `json:"kpis"`
	Series       []AdminSalesBucket `json:"series"`
	Attention    AdminAttention     `json:"attention"`
	LatestOrders []AdminOrderRow    `json:"latest_orders"`
}
type MetricPeriod struct {
	Period, Granularity                string
	From, To, PreviousFrom, PreviousTo time.Time
	Buckets                            []AdminSalesBucket
}
type PaidOrder struct {
	At            time.Time
	Amount, Units int64
}

// RelativeTime uses seconds plus nanoseconds instead of time.Duration so long
// custom ranges do not silently saturate at Duration's approximately 292 years.
func RelativeTime(origin, at, base time.Time) time.Time {
	return time.Unix(origin.Unix()+at.Unix()-base.Unix(), int64(origin.Nanosecond()+at.Nanosecond()-base.Nanosecond())).UTC()
}
func ResolveMetricPeriod(values map[string][]string, now time.Time) (MetricPeriod, error) {
	w := MetricPeriod{Period: "last_30_days", Granularity: "day", Buckets: []AdminSalesBucket{}}
	if err := AdminValues(values, []string{"period", "from_date", "to_date"}, nil); err != nil {
		return w, err
	}
	get := func(k string) string {
		if len(values[k]) == 0 {
			return ""
		}
		return values[k][0]
	}
	if len(values["period"]) > 0 {
		w.Period = get("period")
	}
	today := DayStart(now)
	w.To = now.UTC()
	switch w.Period {
	case "today":
		w.From = today.UTC()
		w.Granularity = "hour"
	case "last_7_days":
		w.From = today.AddDate(0, 0, -6).UTC()
	case "last_30_days":
		w.From = today.AddDate(0, 0, -29).UTC()
	case "range":
		a, err := CalendarDate(get("from_date"))
		if err != nil {
			return w, Validation("from_date", "invalid")
		}
		b, err := CalendarDate(get("to_date"))
		if err != nil || b.Before(a) || b.After(today) {
			return w, Validation("to_date", "invalid")
		}
		w.From = a.UTC()
		w.To = b.AddDate(0, 0, 1).UTC()
	default:
		return w, Validation("period", "invalid")
	}
	if w.Period != "range" && (len(values["from_date"]) > 0 || len(values["to_date"]) > 0) {
		return w, Validation("period", "invalid_combination")
	}
	w.PreviousTo = w.From
	w.PreviousFrom = RelativeTime(w.From, w.From, w.To)
	if w.Period == "today" {
		w.PreviousFrom = today.AddDate(0, 0, -1).UTC()
		w.PreviousTo = RelativeTime(w.PreviousFrom, w.To, w.From)
	}
	for at := w.From; at.Before(w.To); {
		to := at.In(Bogota()).AddDate(0, 0, 1).UTC()
		if w.Granularity == "hour" {
			to = at.Add(time.Hour)
		}
		if to.After(w.To) {
			to = w.To
		}
		w.Buckets = append(w.Buckets, AdminSalesBucket{From: at, To: to, PreviousFrom: RelativeTime(w.PreviousFrom, at, w.From), PreviousTo: RelativeTime(w.PreviousFrom, to, w.From)})
		at = to
	}
	return w, nil
}
func Comparison(current, previous int64) AdminComparison {
	out := AdminComparison{Value: current, Previous: previous}
	if previous != 0 {
		v := (float64(current) - float64(previous)) * 100 / float64(previous)
		out.Delta = &v
	}
	return out
}
func Average(amount, count int64) int64 {
	if count == 0 {
		return 0
	}
	q, r := amount/count, amount%count
	if r >= count/2+count%2 {
		q++
	}
	return q
}
