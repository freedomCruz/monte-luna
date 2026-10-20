package cryptography_test

import (
	"bytes"
	"encoding/base64"
	"testing"
	"time"

	"github.com/freedomCruz/monte-luna/backend/internal/identity/adapters/cryptography"
	"github.com/freedomCruz/monte-luna/backend/internal/identity/app"
	"github.com/freedomCruz/monte-luna/backend/internal/identity/domain"
)

func TestInvitationUsesCanonicalResetTokensAndAAD(t *testing.T) {
	generator := cryptography.NewResetTokens(bytes.NewReader(make([]byte, 32)))
	cipher, err := cryptography.NewCipher(make([]byte, 32), bytes.NewReader(make([]byte, 24)))
	if err != nil {
		t.Fatal(err)
	}
	issuer, err := app.NewTokenIssuer(cipher, generator)
	if err != nil {
		t.Fatal(err)
	}
	now := time.Unix(1800000000, 0).UTC()
	user := domain.User{ID: "fixture-user", Email: "admin@example.test", DisplayName: "Admin"}
	token, event, err := issuer.Issue(user, "identity.admin_invited", now)
	if err != nil {
		t.Fatal(err)
	}
	encrypted, err := base64.StdEncoding.Strict().DecodeString(event.Payload.RawTokenEncrypted)
	if err != nil {
		t.Fatal("bad ciphertext encoding")
	}
	raw, err := cipher.Open(encrypted, domain.PasswordResetPurpose(user.ID))
	if err != nil || len(raw) != 43 {
		t.Fatal("invitation incompatible with canonical AAD/format")
	}
	hash, err := generator.Hash(string(raw))
	if err != nil || hash != token.Hash {
		t.Fatal("invitation incompatible with canonical hash")
	}
	if _, err := cipher.Open(encrypted, domain.PasswordResetPurpose("other-user")); err == nil {
		t.Fatal("ciphertext not bound to recipient")
	}
	if !token.ExpiresAt.Equal(now.Add(domain.PasswordResetLifetime)) || !token.CreatedAt.Equal(now) || event.Type != "identity.admin_invited" {
		t.Fatal("incorrect invitation lifetime/type")
	}
	if _, _, err := issuer.Issue(user, "identity.unknown", now); err == nil {
		t.Fatal("unknown event allowed")
	}
	if _, _, err := issuer.Issue(user, "identity.admin_invited", now); err == nil {
		t.Fatal("entropy exhaustion ignored")
	}
}
