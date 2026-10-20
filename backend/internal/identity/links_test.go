package identity_test

import (
	"bytes"
	"context"
	"encoding/base64"
	"errors"
	"strings"
	"testing"

	"github.com/freedomCruz/monte-luna/backend/internal/identity"
	"github.com/freedomCruz/monte-luna/backend/internal/identity/adapters/cryptography"
	"github.com/freedomCruz/monte-luna/backend/internal/identity/domain"
)

const fixtureAdmin = "0199c4e2-7a1b-7c3d-9e0f-1a2b3c4d5e6f"

func sealedToken(t *testing.T, key []byte, admin string) (raw, encrypted string) {
	t.Helper()
	raw, _, err := cryptography.NewResetTokens(nil).Generate()
	if err != nil {
		t.Fatal(err)
	}
	cipher, err := cryptography.NewCipher(key, nil)
	if err != nil {
		t.Fatal(err)
	}
	sealed, err := cipher.Seal([]byte(raw), domain.PasswordResetPurpose(admin))
	if err != nil {
		t.Fatal(err)
	}
	return raw, base64.StdEncoding.EncodeToString(sealed)
}

func TestOneTimeLinksFacade(t *testing.T) {
	key := bytes.Repeat([]byte{7}, 32)
	links, err := identity.NewOneTimeLinks(identity.Config{EncryptionKey: key, StorefrontBaseURL: "https://store.test"})
	if err != nil {
		t.Fatal(err)
	}
	raw, encrypted := sealedToken(t, key, fixtureAdmin)
	token, err := links.Decrypt(t.Context(), fixtureAdmin, encrypted)
	if err != nil || token != raw {
		t.Fatalf("decrypt failed: %v", err)
	}
	bound, err := links.ForAdmin(fixtureAdmin).Decrypt(t.Context(), encrypted)
	if err != nil || bound != raw {
		t.Fatal("single-argument decryptor failed")
	}
	for eventType, want := range map[string]string{
		identity.PasswordResetRequested: "https://store.test/admin/restablecer-contrasena#token=" + raw,
		identity.AdminInvited:           "https://store.test/admin/invitacion#token=" + raw,
	} {
		link, err := links.Build(t.Context(), eventType, token)
		if err != nil || link != want {
			t.Fatalf("%s link %q err=%v", eventType, link, err)
		}
	}
	_, otherKey := sealedToken(t, bytes.Repeat([]byte{8}, 32), fixtureAdmin)
	_, otherAdmin := sealedToken(t, key, "0199c4e2-7a1b-7c3d-9e0f-1a2b3c4d5e70")
	for name, attempt := range map[string]func() (string, error){
		"wrong admin AAD":    func() (string, error) { return links.Decrypt(t.Context(), fixtureAdmin, otherAdmin) },
		"wrong key":          func() (string, error) { return links.Decrypt(t.Context(), fixtureAdmin, otherKey) },
		"missing admin":      func() (string, error) { return links.Decrypt(t.Context(), "", encrypted) },
		"not base64":         func() (string, error) { return links.Decrypt(t.Context(), fixtureAdmin, "%%%") },
		"truncated":          func() (string, error) { return links.Decrypt(t.Context(), fixtureAdmin, encrypted[:20]) },
		"unknown event type": func() (string, error) { return links.Build(t.Context(), "orders.order_paid", raw) },
		"malformed token":    func() (string, error) { return links.Build(t.Context(), identity.AdminInvited, raw+"x") },
	} {
		t.Run(name, func(t *testing.T) {
			value, err := attempt()
			if value != "" || !errors.Is(err, identity.ErrInvalidOneTimeToken) || strings.Contains(err.Error(), raw) {
				t.Fatalf("value=%q err=%v", value, err)
			}
		})
	}
	cancelled, cancel := context.WithCancel(t.Context())
	cancel()
	if _, err := links.Decrypt(cancelled, fixtureAdmin, encrypted); !errors.Is(err, context.Canceled) {
		t.Fatal("cancelled context ignored")
	}
	if _, err := identity.NewOneTimeLinks(identity.Config{EncryptionKey: key[:31], StorefrontBaseURL: "https://store.test"}); err == nil {
		t.Fatal("short key accepted")
	}
}
