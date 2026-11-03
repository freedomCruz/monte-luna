package domain

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"slices"
	"strconv"
	"strings"
	"time"
	_ "time/tzdata" // Keep the store zone available in minimal production images.
)

func Bogota() *time.Location { zone, _ := time.LoadLocation("America/Bogota"); return zone }
func CalendarDate(value string) (time.Time, error) {
	return time.ParseInLocation("2006-01-02", value, Bogota())
}
func DayStart(now time.Time) time.Time {
	v := now.In(Bogota())
	return time.Date(v.Year(), v.Month(), v.Day(), 0, 0, 0, 0, v.Location())
}
func BadAdminQuery() error { return &Error{Status: 400, Code: "bad_request"} }
func AdminValues(values map[string][]string, allowed []string, repeated []string) error {
	for key, v := range values {
		if !slices.Contains(allowed, key) {
			return Validation(key, "unknown_field")
		}
		if len(v) != 1 && !slices.Contains(repeated, key) {
			return BadAdminQuery()
		}
	}
	return nil
}
func ParseAdminFilter(values map[string][]string, now time.Time) (AdminFilter, error) {
	f := AdminFilter{Sort: "-placed_at", Limit: 25}
	allowed := []string{"search", "status", "date_filter", "from_date", "to_date", "payment_method_type", "pending_dispatch", "sort", "limit", "cursor"}
	if err := AdminValues(values, allowed, []string{"status", "payment_method_type"}); err != nil {
		return f, err
	}
	get := func(k string) string {
		if len(values[k]) == 0 {
			return ""
		}
		return values[k][0]
	}
	f.Search = strings.TrimSpace(get("search"))
	f.Cursor = get("cursor")
	if _, ok := values["cursor"]; ok && f.Cursor == "" {
		return f, BadAdminQuery()
	}
	for _, s := range values["status"] {
		if !slices.Contains([]string{"pending_payment", "paid", "preparing", "shipped", "delivered", "cancelled", "expired"}, s) {
			return f, Validation("status", "invalid")
		}
		f.Statuses = append(f.Statuses, s)
	}
	for _, s := range values["payment_method_type"] {
		if !slices.Contains([]string{"card", "pse", "nequi", "bancolombia_transfer"}, s) {
			return f, Validation("payment_method_type", "invalid")
		}
		f.Methods = append(f.Methods, s)
	}
	slices.Sort(f.Statuses)
	f.Statuses = slices.Compact(f.Statuses)
	slices.Sort(f.Methods)
	f.Methods = slices.Compact(f.Methods)
	if v, ok := values["pending_dispatch"]; ok {
		if v[0] != "true" && v[0] != "false" {
			return f, BadAdminQuery()
		}
		f.Pending = v[0] == "true"
	}
	if v, ok := values["sort"]; ok {
		f.Sort = v[0]
		if f.Sort != "placed_at" && f.Sort != "-placed_at" {
			return f, Validation("sort", "invalid")
		}
	}
	if v, ok := values["limit"]; ok {
		n, err := strconv.Atoi(v[0])
		if err != nil {
			return f, BadAdminQuery()
		}
		if n != 25 && n != 50 && n != 100 {
			return f, Validation("limit", "invalid")
		}
		f.Limit = n
	}
	dates := get("date_filter")
	if dates == "" {
		dates = "last_30_days"
	}
	switch dates {
	case "last_30_days":
		a := DayStart(now).AddDate(0, 0, -29).UTC()
		b := DayStart(now).AddDate(0, 0, 1).UTC()
		f.From = &a
		f.To = &b
	case "all":
	case "range":
		a, err := CalendarDate(get("from_date"))
		if err != nil {
			return f, Validation("from_date", "invalid")
		}
		b, err := CalendarDate(get("to_date"))
		if err != nil || b.Before(a) {
			return f, Validation("to_date", "invalid")
		}
		a = a.UTC()
		b = b.AddDate(0, 0, 1).UTC()
		f.From = &a
		f.To = &b
	default:
		return f, Validation("date_filter", "invalid")
	}
	if dates != "range" && (len(values["from_date"]) > 0 || len(values["to_date"]) > 0) {
		return f, Validation("date_filter", "invalid_combination")
	}
	canonical := f
	canonical.Cursor = ""
	canonical.Limit = 0
	encoded, err := json.Marshal(canonical)
	if err != nil {
		return f, err
	}
	sum := sha256.Sum256(encoded)
	f.Fingerprint = hex.EncodeToString(sum[:])
	return f, nil
}
