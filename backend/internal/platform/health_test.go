package platform_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/freedomCruz/monte-luna/backend/internal/contracttest"
	"github.com/freedomCruz/monte-luna/backend/internal/platform"
)

func TestHealthMatchesContract(t *testing.T) {
	contract := contracttest.Load(t, "platform.yaml")
	mux := http.NewServeMux()
	platform.RegisterRoutes(mux)

	rec := contract.Do(t, mux, httptest.NewRequest(http.MethodGet, "/api/v1/health", nil))

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusOK)
	}
	if got := rec.Header().Get("Cache-Control"); got != "no-store" {
		t.Errorf("Cache-Control = %q, want %q", got, "no-store")
	}
	if got := rec.Header().Get("Content-Type"); got != "application/json" {
		t.Errorf("Content-Type = %q, want %q", got, "application/json")
	}
	var body struct {
		Status string `json:"status"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode body: %v", err)
	}
	if body.Status != "ok" {
		t.Errorf("status field = %q, want %q", body.Status, "ok")
	}
}

func TestHealthRejectsWrongMethod(t *testing.T) {
	mux := http.NewServeMux()
	platform.RegisterRoutes(mux)

	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, httptest.NewRequest(http.MethodPost, "/api/v1/health", nil))

	if rec.Code != http.StatusMethodNotAllowed {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusMethodNotAllowed)
	}
}
