package app_test

import (
	"crypto/sha256"
	"encoding/hex"
	"strings"
	"testing"

	"github.com/freedomCruz/monte-luna/backend/internal/payments/app"
)

func TestDynamicWebhookChecksum(t *testing.T) {
	for _, tt := range []struct{ name, properties, concatenated string }{{"original", `["transaction.id","transaction.status","transaction.amount_in_cents"]`, "providerPENDING4500000"}, {"reordered", `["transaction.amount_in_cents","transaction.id","transaction.status"]`, "4500000providerPENDING"}, {"new property", `["transaction.custom","transaction.id"]`, "newprovider"}} {
		t.Run(tt.name, func(t *testing.T) {
			sum := sha256.Sum256([]byte(tt.concatenated + "123fixture-events"))
			checksum := hex.EncodeToString(sum[:])
			body := `{"event":"transaction.updated","data":{"transaction":{"id":"provider","reference":"REF","status":"PENDING","amount_in_cents":4500000,"currency":"COP","payment_method_type":"PSE","custom":"new"}},"environment":"test","signature":{"properties":` + tt.properties + `,"checksum":"` + checksum + `"},"timestamp":123,"sent_at":"2026-10-16T18:00:00Z"}`
			transaction, key, err := app.VerifyWebhook([]byte(body), strings.ToUpper(checksum), "fixture-events")
			if err != nil || key != checksum || transaction.ID != "provider" {
				t.Fatalf("valid dynamic signature rejected: %v", err)
			}
			for _, bad := range []struct{ body, header string }{{body, ""}, {strings.Replace(body, `"PENDING"`, `"APPROVED"`, 1), checksum}, {strings.Replace(body, `"custom":"new"`, `"custom":"tampered"`, 1), checksum}, {strings.Replace(body, `"transaction.id"`, `"transaction.missing"`, 1), checksum}} {
				// The custom property is signed only by the corresponding fixture.
				if tt.name != "new property" && strings.Contains(bad.body, `"custom":"tampered"`) {
					continue
				}
				if tt.name == "new property" && strings.Contains(bad.body, `"APPROVED"`) {
					continue
				}
				if _, _, err := app.VerifyWebhook([]byte(bad.body), bad.header, "fixture-events"); err == nil {
					t.Fatal("invalid signature accepted")
				}
			}
		})
	}
}
