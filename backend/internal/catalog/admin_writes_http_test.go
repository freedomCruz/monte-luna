package catalog_test

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"net/url"
	"reflect"
	"strings"
	"testing"

	"github.com/freedomCruz/monte-luna/backend/internal/contracttest"
	"github.com/freedomCruz/monte-luna/backend/internal/identity"
)

// Snapshot every public product/variant and its inventory pages, not repository
// internals. This includes parent/child versions, categories, images, lot IDs and
// metadata, stock quantities and full ledger rows/counts. Stock rows have no
// version column; their parent product and lot versions are exposed instead.
// adminCatalog supplies a fixed read clock, so no response fields are discarded.
func snapshotAdminCatalogHTTP(t *testing.T, mux http.Handler, c *contracttest.Contract, access *catalogReadAccess) map[string]string {
	t.Helper()
	role, accessErr := access.role, access.err
	access.role, access.err = "owner", nil
	defer func() { access.role, access.err = role, accessErr }()
	state := map[string]string{}
	get := func(path string) map[string]any {
		t.Helper()
		rec := c.Do(t, mux, httptest.NewRequest("GET", path, nil))
		if rec.Code != 200 || rec.Header().Get("Cache-Control") != "no-store" {
			t.Fatalf("snapshot %s: %d %s", path, rec.Code, rec.Body.String())
		}
		state[path] = rec.Header().Get("ETag") + "\n" + rec.Body.String()
		var body map[string]any
		if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
			t.Fatal(err)
		}
		return body
	}
	pages := func(path string) []map[string]any {
		t.Helper()
		var items []map[string]any
		seen := map[string]bool{}
		for next := path + "?limit=100"; next != ""; {
			if seen[next] {
				t.Fatalf("snapshot cursor loop: %s", next)
			}
			seen[next] = true
			body := get(next)
			for _, item := range body["items"].([]any) {
				items = append(items, item.(map[string]any))
			}
			next = ""
			if cursor, ok := body["next_cursor"].(string); ok {
				next = path + "?limit=100&cursor=" + url.QueryEscape(cursor)
			}
		}
		return items
	}
	products := pages("/api/v1/admin/products")
	if len(products) == 0 {
		t.Fatal("snapshot fixture has no products")
	}
	for _, product := range products {
		base := "/api/v1/admin/products/" + product["id"].(string)
		detail := get(base)
		for _, value := range detail["variants"].([]any) {
			variant := value.(map[string]any)["id"].(string)
			get(base + "/variants/" + variant)
			inventory := "/api/v1/admin/inventory/variants/" + variant
			get(inventory)
			pages(inventory + "/lots")
			pages(inventory + "/movements")
		}
	}
	return state
}

func assertAdminCatalogHTTPUnchanged(t *testing.T, before, after map[string]string) {
	t.Helper()
	if reflect.DeepEqual(before, after) {
		return
	}
	for path, state := range before {
		if after[path] != state {
			t.Fatalf("rejected write changed public state at %s\nbefore: %s\nafter: %s", path, state, after[path])
		}
	}
	t.Fatalf("rejected write added observable resources: before %d endpoints, after %d", len(before), len(after))
}

func TestAdminCatalogWriteHTTPContract(t *testing.T) {
	db, mux, c, access, _, _ := adminCatalog(t)
	product := adminScalar(t, db, `SELECT id FROM catalog.products WHERE slug='finca-el-mirador'`)
	variant := adminScalar(t, db, `SELECT id FROM catalog.product_variants WHERE sku='MIRADOR-250-WHOLE_BEAN'`)
	typ := adminScalar(t, db, `SELECT product_type_id FROM catalog.products WHERE id=$1`, product)
	attributes := adminScalar(t, db, `SELECT attributes::text FROM catalog.products WHERE id=$1`, product)
	options := adminScalar(t, db, `SELECT options::text FROM catalog.product_variants WHERE id=$1`, variant)
	base := "/api/v1/admin/products/" + product
	call := func(method, path, body, etag string, status int, code string, valid bool) map[string]any {
		t.Helper()
		var before map[string]string
		if status >= 400 {
			before = snapshotAdminCatalogHTTP(t, mux, c, access)
		}
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
		if status >= 400 {
			if result["code"] != code {
				t.Fatalf("%s %s: code %v, want %s", method, path, result["code"], code)
			}
			assertAdminCatalogHTTPUnchanged(t, before, snapshotAdminCatalogHTTP(t, mux, c, access))
		}
		if status < 300 {
			result["etag_header"] = rec.Header().Get("ETag")
			if rec.Header().Get("ETag") == "" {
				t.Fatal("missing ETag")
			}
			if status == 201 && rec.Header().Get("Location") == "" {
				t.Fatal("missing Location")
			}
		}
		return result
	}
	create := fmt.Sprintf(`{"product_type_id":%q,"title":"New","slug":"http-write-test","attributes":%s}`, typ, attributes)
	access.err = identity.ErrAuthenticationRequired
	call("POST", "/api/v1/admin/products", create, "", 401, "authentication_required", true)
	access.err = identity.ErrForbidden
	call("POST", "/api/v1/admin/products", create, "", 403, "forbidden", true)
	access.err = nil
	created := call("POST", "/api/v1/admin/products", create, "", 201, "", true)
	if created["etag_header"] != `"1"` {
		t.Fatal(created)
	}
	newBase := "/api/v1/admin/products/" + created["id"].(string)
	newVariant := call("POST", newBase+"/variants", fmt.Sprintf(`{"sku":"HTTP-NEW","options":%s,"attributes":{},"price_amount":100,"weight_grams":250,"tax_category":"excluded"}`, options), `"1"`, 201, "", true)
	if newVariant["etag_header"] != `"2"` || newVariant["version"] != float64(1) {
		t.Fatal(newVariant)
	}
	updated := call("PATCH", newBase+"/variants/"+newVariant["id"].(string), `{"compare_at_price_amount":101}`, `"2"`, 200, "", true)
	if updated["etag_header"] != `"3"` || updated["version"] != float64(2) {
		t.Fatal(updated)
	}
	if got := call("POST", "/api/v1/admin/products", create, "", 409, "slug_conflict", true); got["code"] != "slug_conflict" {
		t.Fatal(got)
	}
	for _, endpoint := range []struct{ method, path, body string }{{"PATCH", base, `{"title":"Changed"}`}, {"POST", base + "/variants", fmt.Sprintf(`{"sku":"HTTP-WRITE","options":%s,"attributes":{},"price_amount":100,"weight_grams":250,"tax_category":"excluded"}`, options)}, {"PATCH", base + "/variants/" + variant, `{"price_amount":100}`}} {
		call(endpoint.method, endpoint.path, endpoint.body, "", 428, "precondition_required", false)
		call(endpoint.method, endpoint.path, endpoint.body, `"999"`, 412, "version_conflict", true)
		access.err = identity.ErrAuthenticationRequired
		call(endpoint.method, endpoint.path, endpoint.body, `"1"`, 401, "authentication_required", true)
		access.err = identity.ErrForbidden
		call(endpoint.method, endpoint.path, endpoint.body, `"1"`, 403, "forbidden", true)
		access.err = nil
	}
	call("PATCH", base, `{"title":"Changed"}`, `"1"`, 200, "", true)
	v := call("POST", base+"/variants", fmt.Sprintf(`{"sku":"HTTP-WRITE","options":%s,"attributes":{},"price_amount":100,"weight_grams":250,"tax_category":"excluded"}`, options), `"2"`, 409, "variant_options_conflict", true)
	if v["code"] != "variant_options_conflict" {
		t.Fatal(v)
	}
	call("PATCH", base+"/variants/"+variant, `{"price_amount":100}`, `"2"`, 200, "", true)
	for _, body := range []string{`{"title":null}`, `{"stock":10}`} {
		call("PATCH", base, body, `"3"`, 422, "validation_failed", false)
	}
	call("PATCH", base, `{"title":"must not persist","attributes":{"unknown":"value"}}`, `"3"`, 422, "validation_failed", true)
	call("POST", "/api/v1/admin/products", fmt.Sprintf(`{"product_type_id":%q,"title":"","slug":"rejected-create","attributes":%s}`, typ, attributes), "", 422, "validation_failed", false)
	call("POST", base+"/variants", fmt.Sprintf(`{"sku":"REJECTED-CREATE","options":%s,"attributes":{},"price_amount":100,"compare_at_price_amount":100,"weight_grams":250,"tax_category":"excluded"}`, options), `"3"`, 422, "validation_failed", true)
	call("PATCH", newBase+"/variants/"+newVariant["id"].(string), `{"sku":"must-not-persist","compare_at_price_amount":100}`, `"3"`, 422, "validation_failed", true)
	// Uniqueness fails after association/image work inside the transaction;
	// the public snapshot must also retain those children and every version.
	call("PATCH", base, `{"slug":"http-write-test","title":"must not persist","category_ids":[],"images":[]}`, `"3"`, 409, "slug_conflict", true)
	call("PATCH", base+"/variants/"+variant, `{"sku":"HTTP-NEW","price_amount":200}`, `"3"`, 409, "sku_conflict", true)
	call("PATCH", base, `{"title":42}`, `"3"`, 422, "validation_failed", false)
	call("PATCH", base, `{`, `"3"`, 400, "bad_request", false)
	for _, endpoint := range []struct{ method, path, body string }{
		{"POST", "/api/v1/admin/products", create},
		{"PATCH", base, `{"title":"CSRF"}`},
		{"POST", newBase + "/variants", fmt.Sprintf(`{"sku":"CSRF","options":%s,"attributes":{},"price_amount":100,"weight_grams":1,"tax_category":"excluded"}`, options)},
		{"PATCH", newBase + "/variants/" + newVariant["id"].(string), `{"price_amount":100}`},
	} {
		before := snapshotAdminCatalogHTTP(t, mux, c, access)
		req := httptest.NewRequest(endpoint.method, endpoint.path, strings.NewReader(endpoint.body))
		kind := "application/json"
		if endpoint.method == "PATCH" {
			kind = "application/merge-patch+json"
		}
		req.Header.Set("Content-Type", kind)
		req.Header.Set("If-Match", `"3"`)
		req.Header.Set("Sec-Fetch-Site", "cross-site")
		rec := c.Do(t, mux, req)
		var problem map[string]any
		if err := json.Unmarshal(rec.Body.Bytes(), &problem); err != nil {
			t.Fatal(err)
		}
		if rec.Code != 403 || problem["code"] != "cross_origin_rejected" {
			t.Fatalf("CSRF %d %s", rec.Code, rec.Body.String())
		}
		assertAdminCatalogHTTPUnchanged(t, before, snapshotAdminCatalogHTTP(t, mux, c, access))
	}
}
