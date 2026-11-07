package catalog_test

import (
	"encoding/json"
	"fmt"
	"github.com/freedomCruz/monte-luna/backend/internal/identity"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestAdminCatalogWriteHTTPContract(t *testing.T) {
	db, mux, c, access, _, _ := adminCatalog(t)
	product := adminScalar(t, db, `SELECT id FROM catalog.products WHERE slug='finca-el-mirador'`)
	variant := adminScalar(t, db, `SELECT id FROM catalog.product_variants WHERE sku='MIRADOR-250-WHOLE_BEAN'`)
	typ := adminScalar(t, db, `SELECT product_type_id FROM catalog.products WHERE id=$1`, product)
	attributes := adminScalar(t, db, `SELECT attributes::text FROM catalog.products WHERE id=$1`, product)
	options := adminScalar(t, db, `SELECT options::text FROM catalog.product_variants WHERE id=$1`, variant)
	base := "/api/v1/admin/products/" + product
	call := func(method, path, body, etag string, status int, valid bool) map[string]any {
		t.Helper()
		req := httptest.NewRequest(method, path, strings.NewReader(body))
		kind := "application/json"
		if method == "PATCH" {
			kind = "application/merge-patch+json"
		}
		req.Header.Set("Content-Type", kind)
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
			t.Fatalf("%s %s: %d %s", method, path, rec.Code, rec.Body.String())
		}
		var result map[string]any
		if err := json.Unmarshal(rec.Body.Bytes(), &result); err != nil {
			t.Fatal(err)
		}
		if status < 300 {
			version := result["version"]
			if result["product_version"] != nil {
				version = result["product_version"]
			}
			if strings.Contains(path, "/variants/") && method == "PATCH" {
				version = float64(3)
			}
			if rec.Header().Get("ETag") == "" {
				t.Fatal("missing ETag")
			}
			_ = version
			if status == 201 && rec.Header().Get("Location") == "" {
				t.Fatal("missing Location")
			}
		}
		return result
	}
	create := fmt.Sprintf(`{"product_type_id":%q,"title":"New","slug":"http-write-test","attributes":%s}`, typ, attributes)
	call("POST", "/api/v1/admin/products", create, "", 201, true)
	if got := call("POST", "/api/v1/admin/products", create, "", 409, true); got["code"] != "slug_conflict" {
		t.Fatal(got)
	}
	for _, endpoint := range []struct{ method, path, body string }{{"PATCH", base, `{"title":"Changed"}`}, {"POST", base + "/variants", fmt.Sprintf(`{"sku":"HTTP-WRITE","options":%s,"attributes":{},"price_amount":100,"weight_grams":250,"tax_category":"excluded"}`, options)}, {"PATCH", base + "/variants/" + variant, `{"price_amount":100}`}} {
		call(endpoint.method, endpoint.path, endpoint.body, "", 428, false)
		call(endpoint.method, endpoint.path, endpoint.body, `"999"`, 412, true)
		access.err = identity.ErrAuthenticationRequired
		call(endpoint.method, endpoint.path, endpoint.body, `"1"`, 401, true)
		access.err = identity.ErrForbidden
		call(endpoint.method, endpoint.path, endpoint.body, `"1"`, 403, true)
		access.err = nil
	}
	call("PATCH", base, `{"title":"Changed"}`, `"1"`, 200, true)
	v := call("POST", base+"/variants", fmt.Sprintf(`{"sku":"HTTP-WRITE","options":%s,"attributes":{},"price_amount":100,"weight_grams":250,"tax_category":"excluded"}`, options), `"2"`, 409, true)
	if v["code"] != "variant_options_conflict" {
		t.Fatal(v)
	}
	call("PATCH", base+"/variants/"+variant, `{"price_amount":100}`, `"2"`, 200, true)
	for _, body := range []string{`{"title":null}`, `{"stock":10}`} {
		call("PATCH", base, body, `"3"`, 422, false)
	}
	call("PATCH", base, `{"attributes":{"unknown":"value"}}`, `"3"`, 422, true)
}
