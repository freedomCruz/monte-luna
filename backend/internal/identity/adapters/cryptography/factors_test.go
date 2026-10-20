package cryptography_test

import (
	"bytes"
	"encoding/base64"
	"testing"
	"time"

	"github.com/freedomCruz/monte-luna/backend/internal/identity/adapters/cryptography"
)

func TestFactorsRFC6238AndEntropy(t *testing.T) {
	f, err := cryptography.NewFactors("Fixture", nil)
	if err != nil {
		t.Fatal(err)
	}
	for _, tc := range []struct {
		code   string
		second int64
		valid  bool
	}{{"287082", 59, true}, {"287082", 90, false}, {"000000", 59, false}, {"28708", 59, false}, {"abcdef", 59, false}} {
		step, valid := f.Verify("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ", tc.code, time.Unix(tc.second, 0))
		if valid != tc.valid || (valid && step != tc.second/30) {
			t.Fatal("RFC vector mismatch")
		}
	}
	secret, uri, err := f.Generate("admin@example.test")
	if err != nil || secret == "" || uri == "" {
		t.Fatal("secret generation failed")
	}
	codes, err := f.RecoveryCodes(10, 32)
	if err != nil || len(codes) != 10 {
		t.Fatal(err)
	}
	seen := map[string]bool{}
	for _, code := range codes {
		raw, err := base64.RawURLEncoding.DecodeString(code)
		if err != nil || len(raw) != 32 || seen[code] {
			t.Fatal("invalid recovery entropy")
		}
		seen[code] = true
	}
	for _, tc := range []struct{ count, size int }{{0, 32}, {101, 32}, {1, 9}, {1, 129}} {
		if _, err := f.RecoveryCodes(tc.count, tc.size); err == nil {
			t.Fatal("invalid recovery configuration accepted")
		}
	}
	if _, err := cryptography.NewFactors("", nil); err == nil {
		t.Fatal("missing issuer accepted")
	}
	exhausted, err := cryptography.NewFactors("Fixture", bytes.NewReader(nil))
	if err != nil {
		t.Fatal(err)
	}
	if _, _, err := exhausted.Generate("admin@example.test"); err == nil {
		t.Fatal("entropy failure ignored")
	}
	if _, err := exhausted.RecoveryCodes(1, 32); err == nil {
		t.Fatal("entropy failure ignored")
	}
}
