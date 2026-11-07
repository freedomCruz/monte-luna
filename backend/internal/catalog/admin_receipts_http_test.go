package catalog_test

import (
	"encoding/json"
	"github.com/freedomCruz/monte-luna/backend/internal/identity"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestAdminReceiptHTTPContract(t *testing.T) {
	db, mux, c, access, _, _ := adminCatalog(t)
	variant := adminScalar(t, db, `SELECT id FROM catalog.product_variants WHERE sku='MIRADOR-250-WHOLE_BEAN'`)
	path := "/api/v1/admin/inventory/variants/" + variant + "/receive-lot"
	body := `{"lot_code":"HTTP-RECEIPT","production_date":"2026-11-01","quantity":1}`
	call := func(body, etag string, status int, valid bool) map[string]any {
		t.Helper()
		req := httptest.NewRequest("POST", path, strings.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		if etag != "" {
			req.Header.Set("If-Match", etag)
		}
		var rec *httptest.ResponseRecorder
		if valid {
			rec = c.Do(t, mux, req)
		} else {
			rec = c.DoInvalid(t, mux, req)
		}
		if rec.Code != status || rec.Header().Get("Cache-Control") != "no-store" {
			t.Fatalf("status %d body %s", rec.Code, rec.Body.String())
		}
		if status == 200 && rec.Header().Get("ETag") != `"2"` {
			t.Fatal("wrong parent ETag")
		}
		var out map[string]any
		if err := json.Unmarshal(rec.Body.Bytes(), &out); err != nil {
			t.Fatal(err)
		}
		return out
	}
	call(body, "", 428, false)
	access.err = identity.ErrAuthenticationRequired
	call(body, `"1"`, 401, true)
	access.err = identity.ErrForbidden
	call(body, `"1"`, 403, true)
	access.err = nil
	for _, bad := range []string{`{"lot_code":"X","production_date":"2026-11-01","quantity":0}`, `{"lot_code":"X","production_date":"2026-11-01","quantity":-1}`, `{"lot_code":"X","production_date":"2026-11-01","quantity":1,"lot_id":"01946894-3d9a-7c98-b807-6c84c1762c30"}`, `{"lot_code":"X","production_date":"2026-11-01","quantity":1,"actor_id":"01946894-3d9a-7c98-b807-6c84c1762c30"}`} {
		call(bad, `"1"`, 422, false)
	}
	result := call(body, `"1"`, 200, true)
	if result["quantity_after"] != float64(1) || result["product_version"] != float64(2) {
		t.Fatal(result)
	}
	call(body, `"1"`, 412, true)
	call(`{"lot_code":"HTTP-RECEIPT","production_date":"2026-11-02","quantity":1}`, `"2"`, 409, true)
}
