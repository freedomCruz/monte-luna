package cryptography_test

import (
	"bytes"
	"errors"
	"strings"
	"testing"

	"github.com/freedomCruz/monte-luna/backend/internal/identity/adapters/cryptography"
)

type failingReader struct{}

func (failingReader) Read([]byte) (int, error) { return 0, errors.New("random unavailable") }

func TestArgon2idPHC(t *testing.T) {
	h := cryptography.NewHasher(nil)
	hash, err := h.Hash("correct horse")
	if err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(hash, "$argon2id$v=19$m=19456,t=2,p=1$") || strings.Contains(hash, "correct horse") {
		t.Fatal("not OWASP PHC")
	}
	for _, tc := range []struct {
		name, password, hash string
		ok                   bool
	}{
		{"correct", "correct horse", hash, true},
		{"wrong", "wrong", hash, false},
		{"malformed", "correct horse", "bad", false},
		{"resource bound", "correct horse", strings.Replace(hash, "m=19456", "m=4294967295", 1), false},
		{"trailing parameter", "correct horse", strings.Replace(hash, "p=1", "p=1junk", 1), false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			ok, _, err := h.Verify(tc.password, tc.hash)
			if ok != tc.ok || (tc.ok && err != nil) {
				t.Fatalf("ok=%v err=%v", ok, err)
			}
		})
	}
	second, err := h.Hash("correct horse")
	if err != nil || hash == second {
		t.Fatal("salt not random")
	}
	if _, err := h.Hash(""); err == nil {
		t.Fatal("empty password accepted")
	}
	if _, err := cryptography.NewHasher(failingReader{}).Hash("secret"); err == nil {
		t.Fatal("random failure ignored")
	}
}

func TestAESGCM(t *testing.T) {
	key := bytes.Repeat([]byte{7}, 32)
	c, err := cryptography.NewCipher(key, nil)
	if err != nil {
		t.Fatal(err)
	}
	plaintext := []byte("sensitive totp secret")
	ciphertext, err := c.Seal(plaintext, "totp")
	if err != nil {
		t.Fatal(err)
	}
	if bytes.Contains(ciphertext, plaintext) {
		t.Fatal("plaintext persisted")
	}
	got, err := c.Open(ciphertext, "totp")
	if err != nil || !bytes.Equal(got, plaintext) {
		t.Fatal("round trip failed")
	}
	other, err := c.Seal(plaintext, "totp")
	if err != nil || bytes.Equal(ciphertext, other) {
		t.Fatal("nonce reused")
	}
	for _, tc := range []struct {
		name    string
		data    []byte
		purpose string
	}{
		{"wrong context", ciphertext, "outbox"},
		{"truncated", ciphertext[:5], "totp"},
		{"empty", nil, "totp"},
		{"tampered", append(append([]byte{}, ciphertext[:len(ciphertext)-1]...), ciphertext[len(ciphertext)-1]^1), "totp"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			if got, err := c.Open(tc.data, tc.purpose); err == nil || got != nil {
				t.Fatal("invalid ciphertext disclosed data")
			}
		})
	}
	wrong, _ := cryptography.NewCipher(bytes.Repeat([]byte{8}, 32), nil)
	if _, err := wrong.Open(ciphertext, "totp"); err == nil {
		t.Fatal("wrong key accepted")
	}
	if _, err := cryptography.NewCipher(key[:16], nil); err == nil {
		t.Fatal("non-256 bit key accepted")
	}
	if _, err := c.Seal(plaintext, ""); err == nil {
		t.Fatal("empty purpose accepted")
	}
	failed, _ := cryptography.NewCipher(key, failingReader{})
	if _, err := failed.Seal(plaintext, "totp"); err == nil {
		t.Fatal("nonce failure ignored")
	}
}
