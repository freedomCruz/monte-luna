package catalog_test

import (
	"encoding/json"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/freedomCruz/monte-luna/backend/internal/identity"
)

func TestAdminReceiptHTTPContract(t *testing.T) {
	db, mux, c, access, _, _ := adminCatalog(t)
	variant := adminScalar(t, db, `SELECT id FROM catalog.product_variants WHERE sku='MIRADOR-250-WHOLE_BEAN'`)
	path := "/api/v1/admin/inventory/variants/" + variant + "/receive-lot"
	body := `{"lot_code":"HTTP-RECEIPT","production_date":"2026-11-01","quantity":1}`
	call := func(body, etag string, status int, code string, valid bool) map[string]any {
		t.Helper()
		var before map[string]string
		if status >= 400 {
			before = snapshotAdminCatalogHTTP(t, mux, c, access)
		}
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
		if status >= 400 {
			if out["code"] != code {
				t.Fatalf("receipt code %v, want %s", out["code"], code)
			}
			assertAdminCatalogHTTPUnchanged(t, before, snapshotAdminCatalogHTTP(t, mux, c, access))
		}
		return out
	}
	call(body, "", 428, "precondition_required", false)
	access.err = identity.ErrAuthenticationRequired
	call(body, `"1"`, 401, "authentication_required", true)
	access.err = identity.ErrForbidden
	call(body, `"1"`, 403, "forbidden", true)
	access.err = nil
	for _, bad := range []string{`{"lot_code":"X","production_date":"2026-11-01","quantity":0}`, `{"lot_code":"X","production_date":"2026-11-01","quantity":-1}`, `{"lot_code":"X","production_date":"2026-11-01","quantity":1,"lot_id":"01946894-3d9a-7c98-b807-6c84c1762c30"}`, `{"lot_code":"X","production_date":"2026-11-01","quantity":1,"actor_id":"01946894-3d9a-7c98-b807-6c84c1762c30"}`} {
		call(bad, `"1"`, 422, "validation_failed", false)
	}
	before := snapshotAdminCatalogHTTP(t, mux, c, access)
	req := httptest.NewRequest("POST", path, strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("If-Match", `"1"`)
	req.Header.Set("Sec-Fetch-Site", "cross-site")
	rec := c.Do(t, mux, req)
	var problem map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &problem); err != nil {
		t.Fatal(err)
	}
	if rec.Code != 403 || problem["code"] != "cross_origin_rejected" {
		t.Fatalf("receipt CSRF %d %s", rec.Code, rec.Body.String())
	}
	assertAdminCatalogHTTPUnchanged(t, before, snapshotAdminCatalogHTTP(t, mux, c, access))
	result := call(body, `"1"`, 200, "", true)
	if result["quantity_after"] != float64(1) || result["product_version"] != float64(2) || result["lot_created"] != true {
		t.Fatal(result)
	}
	call(body, `"1"`, 412, "version_conflict", true)
	call(`{"lot_code":"HTTP-RECEIPT","production_date":"2026-11-02","quantity":1}`, `"2"`, 409, "lot_conflict", true)
	call(`{"lot_code":"HTTP-RECEIPT","production_date":"2026-11-01","expiration_date":"2026-10-31","quantity":1}`, `"2"`, 422, "validation_failed", true)
	call(`{"lot_code":"HTTP-RECEIPT","production_date":"2026-11-01","quantity":2147483647}`, `"2"`, 422, "validation_failed", true)
}
