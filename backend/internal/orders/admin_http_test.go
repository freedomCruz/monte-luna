package orders_test

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/freedomCruz/monte-luna/backend/internal/identity"
)

type orderAdminAccess struct {
	role string
	err  error
}

func (a *orderAdminAccess) Require(_ context.Context, resource string) (identity.Principal, error) {
	if resource != "orders" {
		panic("wrong resource")
	}
	return identity.Principal{ID: "01946894-3d9a-7c98-b807-6c84c1762c30", Role: a.role}, a.err
}
func TestAdminReadHTTPContract(t *testing.T) {
	clock := &testClock{now: time.Date(2026, 11, 3, 15, 0, 0, 0, time.UTC)}
	db, m, mux, c := orderStorefront(t, clock, nil)
	p := &adminPayments{}
	if err := m.EnableAdminReads(p, adminImages{}, adminShipments{}); err != nil {
		t.Fatal(err)
	}
	access := &orderAdminAccess{role: "owner"}
	if err := m.RegisterAdminReadRoutes(mux, access, func(next http.Handler) http.Handler { return next }); err != nil {
		t.Fatal(err)
	}
	variant := scalar[string](t, db, `SELECT id FROM catalog.product_variants WHERE sku='MIRADOR-250-WHOLE_BEAN'`)
	placed := decode(t, callPlacement(t, mux, c, placeBody(variant, 1), key, false))
	id := placed["order_id"].(string)
	before := placementSnapshot(t, db)
	for _, tt := range []struct {
		name, path, role string
		err              error
		status           int
		code             string
		invalid          bool
	}{
		{name: "list", path: "/api/v1/admin/orders", role: "staff", status: 200},
		{name: "detail", path: "/api/v1/admin/orders/" + id, role: "owner", status: 200},
		{name: "staff metrics", path: "/api/v1/admin/orders/metrics?period=today", role: "staff", status: 200},
		{name: "owner metrics", path: "/api/v1/admin/orders/metrics?period=today", role: "owner", status: 200},
		{name: "anonymous", path: "/api/v1/admin/orders", err: identity.ErrAuthenticationRequired, status: 401, code: "authentication_required"},
		{name: "forbidden", path: "/api/v1/admin/orders", err: identity.ErrForbidden, status: 403, code: "forbidden"},
		{name: "unexpected role", path: "/api/v1/admin/orders", role: "viewer", status: 403, code: "forbidden"},
		{name: "session outage", path: "/api/v1/admin/orders", err: errors.New("private database message"), status: 500, code: "internal_error"},
		{name: "invalid limit", path: "/api/v1/admin/orders?limit=24", role: "owner", status: 422, code: "validation_failed", invalid: true},
		{name: "invalid cursor", path: "/api/v1/admin/orders?cursor=not-base64", role: "owner", status: 400, code: "bad_request"},
		{name: "unknown query", path: "/api/v1/admin/orders?unsafe=1", role: "owner", status: 422, code: "validation_failed"},
		{name: "missing detail", path: "/api/v1/admin/orders/01946894-3d9a-7c98-b807-6c84c1762c35", role: "owner", status: 404, code: "order_not_found"},
	} {
		t.Run(tt.name, func(t *testing.T) {
			access.role = tt.role
			access.err = tt.err
			req := httptest.NewRequest("GET", tt.path, nil)
			var rec *httptest.ResponseRecorder
			if tt.invalid {
				rec = c.DoInvalid(t, mux, req)
			} else {
				rec = c.Do(t, mux, req)
			}
			var body map[string]any
			if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
				t.Fatal(err)
			}
			if rec.Code != tt.status || (tt.code != "" && body["code"] != tt.code) || len(rec.Header().Values("Cache-Control")) != 1 || rec.Header().Get("Cache-Control") != "no-store" {
				t.Fatalf("status=%d body=%v headers=%v", rec.Code, body, rec.Header())
			}
			if tt.name == "detail" && rec.Header().Get("ETag") != `"1"` {
				t.Fatal("detail ETag missing")
			}
			if placementSnapshot(t, db) != before {
				t.Fatal("admin read changed rows, versions, history or outbox")
			}
		})
	}
	if p.refundCalls != 1 {
		t.Fatalf("refund port calls=%d; only owner metrics may query", p.refundCalls)
	}
}
