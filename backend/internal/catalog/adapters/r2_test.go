package adapters_test

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/freedomCruz/monte-luna/backend/internal/catalog/adapters"
)

func TestR2ObjectRequests(t *testing.T) {
	const key = "catalog/products/01946894-3d9a-7c98-b807-6c84c1762c2f/01946894-3d9a-7c98-b807-6c84c1762c30.png"
	data := []byte("\x89PNG\r\n\x1a\nfixture")
	var calls []string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls = append(calls, r.Method)
		if r.URL.Path != "/bucket/"+key {
			t.Errorf("path %s", r.URL.Path)
		}
		if !strings.Contains(r.Header.Get("Authorization"), "/auto/s3/aws4_request") {
			t.Error("request not signed for auto/s3")
		}
		if r.Method == http.MethodPut {
			got, _ := io.ReadAll(r.Body)
			if string(got) != string(data) || r.Header.Get("Content-Type") != "image/png" || r.Header.Get("If-None-Match") != "*" {
				t.Error("PUT data/type/overwrite guard changed")
			}
			w.Header().Set("ETag", `"object"`)
		} else if r.Method != http.MethodDelete {
			t.Errorf("unexpected %s", r.Method)
		}
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()
	media, err := adapters.NewR2("https://media.example/", server.URL, "bucket", "test-access", "test-secret")
	if err != nil {
		t.Fatal(err)
	}
	if err := media.Put(t.Context(), key, "image/png", data); err != nil {
		t.Fatal(err)
	}
	if err := media.Delete(t.Context(), key); err != nil {
		t.Fatal(err)
	}
	if got, err := media.Resolve(t.Context(), "images/existing.jpg"); err != nil || got != "https://media.example/images/existing.jpg" {
		t.Fatalf("legacy Resolve %s %v", got, err)
	}
	for _, bad := range []string{"../escape", key + "/../bad", "/" + key, "images/existing.jpg", strings.ReplaceAll(key, "/", "%2f")} {
		if err := media.Put(t.Context(), bad, "image/png", data); err == nil {
			t.Errorf("unsafe key %s", bad)
		}
		if err := media.Delete(t.Context(), bad); err == nil {
			t.Errorf("unsafe delete %s", bad)
		}
	}
	if len(calls) != 2 {
		t.Fatalf("invalid keys performed I/O: %v", calls)
	}
}

func TestDisabledMediaWrites(t *testing.T) {
	media, err := adapters.NewMedia("https://media.example/")
	if err != nil {
		t.Fatal(err)
	}
	if err := media.Put(context.Background(), "key", "image/png", []byte("data")); err == nil {
		t.Fatal("disabled media accepted write")
	}
	if err := media.Delete(context.Background(), "key"); err != nil {
		t.Fatal(err)
	}
}
