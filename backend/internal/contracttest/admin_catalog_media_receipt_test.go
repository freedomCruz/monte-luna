package contracttest_test

import (
	"encoding/json"
	"strings"
	"testing"

	"github.com/freedomCruz/monte-luna/backend/internal/contracttest"
)

func TestAdminCatalogMediaAndReceipt(t *testing.T) {
	doc := contracttest.Load(t, "catalog.yaml").Doc()
	for _, tt := range []struct{ path, id, status string }{
		{"/api/v1/admin/products/{id}/images", "uploadAdminProductImage", "201"},
		{"/api/v1/admin/inventory/variants/{id}/receive-lot", "receiveAdminVariantLot", "200"},
	} {
		item := doc.Paths.Find(tt.path)
		if item == nil || item.Post == nil || item.Post.OperationID != tt.id {
			t.Fatalf("missing %s", tt.id)
		}
		op := item.Post
		var guarded bool
		for _, p := range op.Parameters {
			if p.Value.Name == "If-Match" {
				guarded = p.Value.Required && p.Value.Schema.Value.Pattern == `^"[1-9][0-9]*"$`
			}
		}
		if !guarded {
			t.Fatal("child writes require parent product If-Match")
		}
		for _, status := range []string{tt.status, "400", "401", "403", "404", "412", "422", "428", "500"} {
			if op.Responses.Value(status) == nil {
				t.Fatalf("%s missing %s", tt.id, status)
			}
		}
		if op.Responses.Value(tt.status).Value.Headers["ETag"] == nil {
			t.Fatal("new parent ETag required")
		}
	}
	upload := doc.Paths.Find("/api/v1/admin/products/{id}/images").Post
	for _, status := range []string{"413", "415", "503"} {
		if upload.Responses.Value(status) == nil {
			t.Fatalf("upload missing %s", status)
		}
	}
	media := upload.RequestBody.Value.Content.Get("multipart/form-data")
	if media == nil || media.Schema.Value.Properties["file"].Value.MaxLength == nil || *media.Schema.Value.Properties["file"].Value.MaxLength != 5*1024*1024 {
		t.Fatal("5 MiB multipart file limit required")
	}
	if media.Encoding["file"] == nil || media.Encoding["file"].ContentType != "image/jpeg, image/png, image/webp" {
		t.Fatal("only JPG/PNG/WebP allowed")
	}
	image := doc.Paths.Find("/api/v1/admin/products/{id}/images/{image_id}")
	if image == nil || image.Get == nil || image.Get.OperationID != "getAdminProductImage" {
		t.Fatal("image Location must be readable")
	}
}

func TestAdminCatalogReceiptAndUploadSchemas(t *testing.T) {
	doc := contracttest.Load(t, "catalog.yaml").Doc()
	for _, tt := range []struct {
		schema, body string
		invalid      bool
	}{
		{"AdminReceiveLot", `{"lot_code":"LOT-1","production_date":"2026-11-06","quantity":24}`, false},
		{"AdminReceiveLot", `{"lot_code":"LOT-1","production_date":"2026-11-06","expiration_date":null,"quantity":1,"note":null}`, false},
		{"AdminReceiveLot", `{"lot_code":"LOT-1","production_date":"2026-11-06","quantity":0}`, true},
		{"AdminReceiveLot", `{"lot_code":"LOT-1","production_date":"2026-11-06","quantity":-1}`, true},
		{"AdminReceiveLot", `{"lot_code":"LOT-1","production_date":"2026-11-06","quantity":2147483648}`, true},
		{"AdminReceiveLot", `{"lot_code":"LOT-1","production_date":"2026-11-06","quantity":1,"product_id":"01946894-3d9a-7c98-b807-6c84c1762c2f"}`, true},
		{"AdminReceiveLot", `{"lot_code":"LOT-1","production_date":"2026-11-06","quantity":1,"reason":"adjustment"}`, true},
		{"AdminReceiveLot", `{"lot_code":" ","production_date":"2026-11-06","quantity":1}`, true},
		{"AdminImageUpload", `{"file":"binary-image","alt_text":"Coffee bag"}`, false},
		{"AdminImageUpload", `{"file":"binary-image","alt_text":" "}`, true},
		{"AdminImageUpload", `{"file":"binary-image","alt_text":"Coffee","storage_key":"../../key"}`, true},
		{"AdminImageUpload", `{"file":"binary-image","alt_text":"Coffee","url":"https://untrusted.example/image"}`, true},
		{"AdminImageUpload", `{"file":"binary-image"}`, true},
	} {
		t.Run(tt.schema+tt.body, func(t *testing.T) {
			ref := doc.Components.Schemas[tt.schema]
			if ref == nil {
				t.Fatalf("missing %s", tt.schema)
			}
			var value any
			if err := json.Unmarshal([]byte(tt.body), &value); err != nil {
				t.Fatal(err)
			}
			if err := ref.Value.VisitJSON(value); (err != nil) != tt.invalid {
				t.Fatalf("invalid=%v: %v", tt.invalid, err)
			}
		})
	}
	ref := doc.Components.Schemas["AdminImageUpload"]
	if ref == nil {
		t.Fatal("missing upload")
	}
	for _, size := range []int{0, 5 * 1024 * 1024, 5*1024*1024 + 1} {
		err := ref.Value.Properties["file"].Value.VisitJSON(strings.Repeat("x", size))
		if (err != nil) != (size == 0 || size > 5*1024*1024) {
			t.Fatalf("file size %d: %v", size, err)
		}
	}
}
