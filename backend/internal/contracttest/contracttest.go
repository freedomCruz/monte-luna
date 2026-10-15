// Package contracttest validates HTTP exchanges against the OpenAPI
// contracts in contracts/openapi. It is imported only by tests.
package contracttest

import (
	"bytes"
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"path/filepath"
	"runtime"
	"testing"

	"github.com/getkin/kin-openapi/openapi3"
	"github.com/getkin/kin-openapi/openapi3filter"
	"github.com/getkin/kin-openapi/routers"
	"github.com/getkin/kin-openapi/routers/legacy"
)

// Contract is a loaded and validated OpenAPI document.
type Contract struct {
	doc    *openapi3.T
	router routers.Router
}

// contractsDir returns the absolute path of contracts/openapi.
func contractsDir() string {
	_, file, _, _ := runtime.Caller(0)
	return filepath.Join(filepath.Dir(file), "..", "..", "..", "contracts", "openapi")
}

// Load reads contracts/openapi/<name>, resolves its references, and fails
// the test if the document is not valid OpenAPI.
func Load(t *testing.T, name string) *Contract {
	t.Helper()
	loader := openapi3.NewLoader()
	loader.IsExternalRefsAllowed = true
	doc, err := loader.LoadFromFile(filepath.Join(contractsDir(), name))
	if err != nil {
		t.Fatalf("load contract %s: %v", name, err)
	}
	if err := doc.Validate(loader.Context); err != nil {
		t.Fatalf("invalid contract %s: %v", name, err)
	}
	// Route matching uses paths only; the document declares no servers.
	doc.Servers = nil
	router, err := legacy.NewRouter(doc)
	if err != nil {
		t.Fatalf("build router for %s: %v", name, err)
	}
	return &Contract{doc: doc, router: router}
}

// Do sends req to handler, checks that both the request and the response
// conform to the contract, and returns the recorded response.
func (c *Contract) Do(t *testing.T, handler http.Handler, req *http.Request) *httptest.ResponseRecorder {
	t.Helper()
	return c.exchange(t, handler, req, true)
}

// DoInvalid proves a deliberately invalid request is rejected by OpenAPI, then
// validates the handler's problem response against the same operation contract.
func (c *Contract) DoInvalid(t *testing.T, handler http.Handler, req *http.Request) *httptest.ResponseRecorder {
	t.Helper()
	return c.exchange(t, handler, req, false)
}
func (c *Contract) exchange(t *testing.T, handler http.Handler, req *http.Request, valid bool) *httptest.ResponseRecorder {
	t.Helper()
	ctx := context.Background()

	var reqBody []byte
	if req.Body != nil {
		reqBody, _ = io.ReadAll(req.Body)
		req.Body = io.NopCloser(bytes.NewReader(reqBody))
	}

	// The router needs an absolute URL; the host is irrelevant.
	matchReq := req.Clone(ctx)
	matchReq.URL = &url.URL{Scheme: "http", Host: "contract.test", Path: req.URL.Path, RawQuery: req.URL.RawQuery}
	matchReq.Body = io.NopCloser(bytes.NewReader(reqBody))

	route, pathParams, err := c.router.FindRoute(matchReq)
	if err != nil {
		t.Fatalf("%s %s is not in the contract: %v", req.Method, req.URL.Path, err)
	}
	reqInput := &openapi3filter.RequestValidationInput{
		Request:    matchReq,
		PathParams: pathParams,
		Route:      route,
		Options:    &openapi3filter.Options{AuthenticationFunc: openapi3filter.NoopAuthenticationFunc},
	}
	validationErr := openapi3filter.ValidateRequest(ctx, reqInput)
	if valid && validationErr != nil {
		t.Fatalf("request does not match the contract: %v", validationErr)
	}
	if !valid && validationErr == nil {
		t.Fatal("negative request unexpectedly matches the contract")
	}

	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	respInput := &openapi3filter.ResponseValidationInput{
		RequestValidationInput: reqInput,
		Status:                 rec.Code,
		Header:                 rec.Header(),
		Options:                &openapi3filter.Options{IncludeResponseStatus: true},
	}
	respInput.SetBodyBytes(rec.Body.Bytes())
	if err := openapi3filter.ValidateResponse(ctx, respInput); err != nil {
		t.Fatalf("response does not match the contract: %v\nbody: %s", err, rec.Body.String())
	}
	return rec
}
