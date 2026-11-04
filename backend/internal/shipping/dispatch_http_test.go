package shipping_test

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/freedomCruz/monte-luna/backend/internal/contracttest"
	"github.com/freedomCruz/monte-luna/backend/internal/identity"
)

type dispatchAccess struct {
	role  string
	err   error
	calls int
}

func (a *dispatchAccess) Require(_ context.Context, resource string) (identity.Principal, error) {
	if resource != "orders" {
		panic("wrong authorization resource")
	}
	a.calls++
	return identity.Principal{ID: fulfillmentActorID, Role: a.role}, a.err
}
func TestDispatchAdminHTTP(t *testing.T) {
	db, url := fulfillmentDB(t)
	m := shipmentModule(t, url)
	a := &dispatchAccess{role: "owner"}
	mux := http.NewServeMux()
	if err := m.RegisterAdminRoutes(mux, a, func(next http.Handler) http.Handler { return next }); err != nil {
		t.Fatal(err)
	}
	contract := contracttest.Load(t, "shipping.yaml")
	const path = "/api/v1/admin/orders/" + fulfillmentOrderID + "/dispatch"
	const valid = `{"carrier_name":" Carrier ","shipment_version":null}`
	for _, tt := range []struct {
		name, body, etag, origin string
		accessErr                error
		status                   int
		code                     string
		invalid                  bool
	}{
		{name: "anonymous", body: valid, etag: `"1"`, accessErr: identity.ErrAuthenticationRequired, status: 401, code: "authentication_required"},
		{name: "forbidden", body: valid, etag: `"1"`, accessErr: identity.ErrForbidden, status: 403, code: "forbidden"},
		{name: "authorization outage", body: valid, etag: `"1"`, accessErr: errors.New("private database error"), status: 500, code: "internal_error"},
		{name: "cross origin", body: valid, etag: `"1"`, origin: "https://hostile.example", status: 403, code: "cross_origin_rejected"},
		{name: "missing precondition", body: valid, status: 412, code: "version_conflict", invalid: true},
		{name: "weak precondition", body: valid, etag: `W/"1"`, status: 400, code: "bad_request", invalid: true},
		{name: "unknown field", body: `{"carrier_name":"Carrier","shipment_version":null,"status":"shipped"}`, etag: `"1"`, status: 422, code: "validation_failed", invalid: true},
		{name: "missing shipment version", body: `{"carrier_name":"Carrier"}`, etag: `"1"`, status: 422, code: "validation_failed", invalid: true},
		{name: "missing carrier", body: `{"shipment_version":null}`, etag: `"1"`, status: 422, code: "validation_failed", invalid: true},
		{name: "invalid tracking", body: `{"carrier_name":"Carrier","shipment_version":null,"tracking_url":"http://carrier.example/123"}`, etag: `"1"`, status: 422, code: "validation_failed", invalid: true},
		{name: "null object", body: `null`, etag: `"1"`, status: 422, code: "validation_failed", invalid: true},
		{name: "broken JSON", body: `{`, etag: `"1"`, status: 400, code: "bad_request", invalid: true},
	} {
		t.Run(tt.name, func(t *testing.T) {
			a.err = tt.accessErr
			before := shipSnapshot(t, db)
			req := httptest.NewRequest("POST", path, strings.NewReader(tt.body))
			req.Header.Set("Content-Type", "application/json")
			if tt.etag != "" {
				req.Header.Set("If-Match", tt.etag)
			}
			if tt.origin != "" {
				req.Header.Set("Origin", tt.origin)
			}
			var rec *httptest.ResponseRecorder
			if tt.invalid {
				rec = contract.DoInvalid(t, mux, req)
			} else {
				rec = contract.Do(t, mux, req)
			}
			var body map[string]any
			if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
				t.Fatal(err)
			}
			if rec.Code != tt.status || body["code"] != tt.code || rec.Header().Get("Cache-Control") != "no-store" {
				t.Fatalf("status=%d body=%v headers=%v", rec.Code, body, rec.Header())
			}
			if strings.Contains(rec.Body.String(), "private database error") {
				t.Fatal("private error leaked")
			}
			if shipSnapshot(t, db) != before {
				t.Fatal("rejection changed rows, versions, history or outbox")
			}
		})
	}
	a.err = nil
	a.role = "staff"
	req := httptest.NewRequest("POST", path, strings.NewReader(valid))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("If-Match", `"1"`)
	rec := contract.Do(t, mux, req)
	if rec.Code != 200 || rec.Header().Get("ETag") != `"2"` || rec.Header().Get("Cache-Control") != "no-store" {
		t.Fatalf("dispatch status=%d headers=%v body=%s", rec.Code, rec.Header(), rec.Body.String())
	}
	var body map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if body["status"] != "shipped" || body["actor_id"] != fulfillmentActorID || body["version"] != float64(2) || body["carrier_name"] != "Carrier" || body["tracking_number"] != nil || body["tracking_url"] != nil || body["shipped_at"] != "2026-11-03T15:00:00Z" {
		t.Fatalf("body=%v", body)
	}
	if shipScalar[int](t, db, `SELECT count(*) FROM shipping.outbox`) != 1 {
		t.Fatal("dispatch event missing")
	}
	// Same version cannot dispatch twice and creates no second event.
	before := shipSnapshot(t, db)
	req = httptest.NewRequest("POST", path, strings.NewReader(valid))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("If-Match", `"1"`)
	rec = contract.Do(t, mux, req)
	if rec.Code != 412 || shipSnapshot(t, db) != before {
		t.Fatalf("repeat changed data: %d %s", rec.Code, rec.Body.String())
	}
}
