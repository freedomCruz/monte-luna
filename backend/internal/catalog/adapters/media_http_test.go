package adapters_test

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"net/textproto"
	"strings"
	"testing"

	"github.com/freedomCruz/monte-luna/backend/internal/catalog/adapters"
	"github.com/freedomCruz/monte-luna/backend/internal/catalog/app"
	"github.com/freedomCruz/monte-luna/backend/internal/catalog/domain"
	"github.com/freedomCruz/monte-luna/backend/internal/contracttest"
	"github.com/freedomCruz/monte-luna/backend/internal/identity"
	"github.com/getkin/kin-openapi/openapi3filter"
	"github.com/getkin/kin-openapi/routers/legacy"
)

const mediaProduct = "01946894-3d9a-7c98-b807-6c84c1762c2f"
const mediaID = "01946894-3d9a-7c98-b807-6c84c1762c30"

type mediaAccess struct {
	role string
	err  error
}

func (a mediaAccess) Require(context.Context, string) (identity.Principal, error) {
	return identity.Principal{ID: mediaID, Role: a.role}, a.err
}

type httpMediaStore struct {
	puts, deletes int
	disabled      bool
}

func (s *httpMediaStore) Resolve(_ context.Context, k string) (string, error) {
	return "https://media.example/" + k, nil
}
func (s *httpMediaStore) Put(context.Context, string, string, []byte) error {
	s.puts++
	if s.disabled {
		return domain.ErrMediaUnavailable
	}
	return nil
}
func (s *httpMediaStore) Delete(context.Context, string) error { s.deletes++; return nil }

type httpImageRepo struct {
	version int32
	images  int
	image   domain.AdminImage
	fail    error
}

func (r *httpImageRepo) CheckImageTarget(_ context.Context, in domain.ImageUpload) error {
	if r.fail != nil {
		return r.fail
	}
	if in.ProductVersion != r.version {
		return &domain.Error{Status: 412, Code: "version_conflict"}
	}
	return nil
}
func (r *httpImageRepo) ReserveImage(context.Context, domain.ImageReservation) error { return nil }
func (r *httpImageRepo) AttachImage(_ context.Context, res domain.ImageReservation, in domain.ImageUpload) (domain.AdminImage, error) {
	r.version++
	r.images++
	r.image = domain.AdminImage{ID: res.ID, ProductID: in.ProductID, VariantID: in.VariantID, AltText: in.AltText, Position: in.Position, StorageKey: res.StorageKey, Version: 1, ProductVersion: r.version}
	return r.image, nil
}
func (r *httpImageRepo) DiscardImage(ctx context.Context, _ string, del func(context.Context, string) error) error {
	return del(ctx, "catalog/products/"+mediaProduct+"/"+mediaID+".png")
}
func (r *httpImageRepo) AdminImage(context.Context, string, string) (domain.AdminImage, error) {
	if r.images == 0 {
		return domain.AdminImage{}, &domain.Error{Status: 404, Code: "image_not_found"}
	}
	return r.image, nil
}
func mediaMux(t *testing.T, access mediaAccess, repo *httpImageRepo, store *httpMediaStore) *http.ServeMux {
	t.Helper()
	service := app.NewImageService(repo, store, func() (string, error) { return mediaID, nil }, http.DetectContentType)
	handler, err := adapters.NewMediaHTTP(service, access)
	if err != nil {
		t.Fatal(err)
	}
	mux := http.NewServeMux()
	handler.RegisterRoutes(mux, func(next http.Handler) http.Handler { return next })
	return mux
}
func mediaRequest(t *testing.T, data []byte, kind string, fields map[string]string) *http.Request {
	t.Helper()
	var buf bytes.Buffer
	form := multipart.NewWriter(&buf)
	header := textproto.MIMEHeader{"Content-Disposition": {`form-data; name="file"; filename="../../untrusted.svg"`}, "Content-Type": {kind}}
	part, err := form.CreatePart(header)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := part.Write(data); err != nil {
		t.Fatal(err)
	}
	for key, value := range fields {
		if err := form.WriteField(key, value); err != nil {
			t.Fatal(err)
		}
	}
	if err := form.Close(); err != nil {
		t.Fatal(err)
	}
	req := httptest.NewRequest(http.MethodPost, "/api/v1/admin/products/"+mediaProduct+"/images", &buf)
	req.Header.Set("Content-Type", form.FormDataContentType())
	req.Header.Set("If-Match", `"1"`)
	return req
}
func TestMediaHTTPContractAndRejectedWrites(t *testing.T) {
	contract := contracttest.Load(t, "catalog.yaml")
	png := []byte("\x89PNG\r\n\x1a\nfixture")
	for _, tt := range []struct {
		name   string
		status int
		code   string
	}{
		{"success", 201, ""}, {"missing_match", 428, "precondition_required"}, {"weak_match", 400, "bad_request"},
		{"wildcard_match", 400, "bad_request"}, {"duplicate_match", 400, "bad_request"}, {"stale", 412, "version_conflict"},
		{"unsigned", 401, "authentication_required"}, {"forbidden", 403, "forbidden"}, {"cross_origin", 403, "cross_origin_rejected"},
		{"blank_alt", 422, "validation_failed"}, {"unknown_key", 422, "validation_failed"}, {"query", 422, "validation_failed"},
		{"empty", 422, "validation_failed"}, {"too_large", 413, "image_too_large"}, {"request_too_large", 413, "image_too_large"},
		{"html", 415, "unsupported_image_type"}, {"mismatch", 415, "unsupported_image_type"}, {"disabled", 503, "media_unavailable"},
		{"foreign_variant", 422, "validation_failed"},
	} {
		t.Run(tt.name, func(t *testing.T) {
			repo := &httpImageRepo{version: 1}
			store := &httpMediaStore{}
			access := mediaAccess{role: "staff"}
			data, kind := png, "image/png"
			fields := map[string]string{"alt_text": "Coffee bag"}
			switch tt.name {
			case "unsigned":
				access.err = identity.ErrAuthenticationRequired
			case "forbidden":
				access.err = identity.ErrForbidden
			case "stale":
				repo.version = 2
			case "blank_alt":
				fields["alt_text"] = " "
			case "unknown_key":
				fields["storage_key"] = "../../key"
			case "empty":
				data = nil
			case "too_large":
				data = append(png, bytes.Repeat([]byte("x"), domain.MaxImageBytes)...)
			case "request_too_large":
				fields["alt_text"] = strings.Repeat("x", 6<<20)
			case "html":
				data = []byte("<html>not an image</html>")
			case "mismatch":
				kind = "image/jpeg"
			case "disabled":
				store.disabled = true
			case "foreign_variant":
				repo.fail = &domain.Error{Status: 422, Code: "validation_failed"}
			}
			req := mediaRequest(t, data, kind, fields)
			switch tt.name {
			case "missing_match":
				req.Header.Del("If-Match")
			case "weak_match":
				req.Header.Set("If-Match", `W/"1"`)
			case "wildcard_match":
				req.Header.Set("If-Match", "*")
			case "duplicate_match":
				req.Header.Add("If-Match", `"1"`)
			case "query":
				req.URL.RawQuery = "unknown=value"
			case "cross_origin":
				req.Header.Set("Origin", "https://other.example")
				req.Header.Set("Sec-Fetch-Site", "cross-site")
			}
			mux := mediaMux(t, access, repo, store)
			rec := httptest.NewRecorder()
			mux.ServeHTTP(rec, req)
			if rec.Code != tt.status || rec.Header().Get("Cache-Control") != "no-store" {
				t.Fatalf("%d %v %s", rec.Code, rec.Header(), rec.Body.String())
			}
			if tt.status == 201 {
				if repo.version != 2 || repo.images != 1 || store.puts != 1 || rec.Header().Get("ETag") != `"2"` {
					t.Fatal("missing committed effects")
				}
				if rec.Header().Get("Location") != "/api/v1/admin/products/"+mediaProduct+"/images/"+mediaID || strings.Contains(rec.Body.String(), "storage_key") {
					t.Fatal("location/key exposure")
				}
				request := httptest.NewRequest(http.MethodGet, rec.Header().Get("Location"), nil)
				got := contract.Do(t, mux, request)
				if got.Code != 200 || got.Header().Get("ETag") != `"2"` {
					t.Fatal("created image not readable")
				}
			} else {
				var p struct {
					Code string `json:"code"`
				}
				if err := json.Unmarshal(rec.Body.Bytes(), &p); err != nil || p.Code != tt.code {
					t.Fatalf("problem %s", rec.Body.String())
				}
				wantVersion := int32(1)
				if tt.name == "stale" {
					wantVersion = 2
				}
				if repo.version != wantVersion || repo.images != 0 || store.puts != 0 && tt.name != "disabled" {
					t.Fatalf("rejection wrote data: %+v %+v", repo, store)
				}
			}
		})
	}
	// A valid public HTTP exchange is checked against the approved upload schema.
	repo := &httpImageRepo{version: 1}
	store := &httpMediaStore{}
	request := mediaRequest(t, png, "image/png", map[string]string{"alt_text": "Bag"})
	mux := mediaMux(t, mediaAccess{role: "owner"}, repo, store)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, request)
	if rec.Code != http.StatusCreated {
		t.Fatal(fmt.Sprint(rec.Code))
	}
	// kin-openapi's OpenAPI 3.1 request rewriter does not support multipart.
	// Check the decoded form against its schema and the actual HTTP response
	// against the routed contract instead; never claim unsupported validation.
	doc := contract.Doc()
	schema := doc.Paths.Find("/api/v1/admin/products/{id}/images").Post.RequestBody.Value.Content.Get("multipart/form-data").Schema.Value
	if err := schema.VisitJSON(map[string]any{"file": string(png), "alt_text": "Bag"}); err != nil {
		t.Fatal(err)
	}
	router, err := legacy.NewRouter(doc)
	if err != nil {
		t.Fatal(err)
	}
	route, params, err := router.FindRoute(request)
	if err != nil {
		t.Fatal(err)
	}
	input := &openapi3filter.ResponseValidationInput{
		RequestValidationInput: &openapi3filter.RequestValidationInput{Request: request, PathParams: params, Route: route},
		Status:                 rec.Code, Header: rec.Header(), Options: &openapi3filter.Options{IncludeResponseStatus: true},
	}
	input.SetBodyBytes(rec.Body.Bytes())
	if err := openapi3filter.ValidateResponse(t.Context(), input); err != nil {
		t.Fatal(err)
	}
}
