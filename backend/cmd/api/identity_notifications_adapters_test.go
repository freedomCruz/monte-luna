package main

import (
	"context"
	"encoding/base64"
	"testing"

	"github.com/freedomCruz/monte-luna/backend/internal/identity"
)

func TestIdentityNotificationsAdaptersRequireLinks(t *testing.T) {
	if _, err := newIdentityTokenDecryptor(nil); err == nil {
		t.Fatal("expected error on nil links for decryptor")
	}
	if _, err := newIdentityLinkBuilder(nil); err == nil {
		t.Fatal("expected error on nil links for link builder")
	}
}

func TestIdentityNotificationsAdaptersEndToEnd(t *testing.T) {
	encKey := randomKey(t)
	cfg, err := identity.LoadConfig(func(key string) string {
		switch key {
		case "APP_ENCRYPTION_KEY":
			return encKey
		case "STOREFRONT_BASE_URL":
			return "https://storefront.example.test"
		default:
			return ""
		}
	})
	if err != nil {
		t.Fatal(err)
	}
	links, err := identity.NewOneTimeLinks(cfg)
	if err != nil {
		t.Fatal(err)
	}

	decryptor, err := newIdentityTokenDecryptor(links)
	if err != nil {
		t.Fatal(err)
	}
	linkBuilder, err := newIdentityLinkBuilder(links)
	if err != nil {
		t.Fatal(err)
	}

	ctx := context.Background()

	// LinkBuilder builds reset and invitation links correctly
	fakeRaw := base64.RawURLEncoding.EncodeToString(make([]byte, 32))
	resetLink, err := linkBuilder.Build(ctx, "identity.password_reset_requested", fakeRaw)
	if err != nil {
		t.Fatalf("link build reset: %v", err)
	}
	if resetLink != "https://storefront.example.test/admin/restablecer-contrasena#token="+fakeRaw {
		t.Fatalf("unexpected reset link: %s", resetLink)
	}

	inviteLink, err := linkBuilder.Build(ctx, "identity.admin_invited", fakeRaw)
	if err != nil {
		t.Fatalf("link build invite: %v", err)
	}
	if inviteLink != "https://storefront.example.test/admin/invitacion#token="+fakeRaw {
		t.Fatalf("unexpected invite link: %s", inviteLink)
	}

	// LinkBuilder rejects unknown event types or invalid tokens
	if _, err := linkBuilder.Build(ctx, "orders.order_paid", fakeRaw); err == nil {
		t.Fatal("expected error for unsupported event type")
	}
	if _, err := linkBuilder.Build(ctx, "identity.admin_invited", "short"); err == nil {
		t.Fatal("expected error for short/invalid token")
	}

	// Decryptor rejects invalid admin_user_id or ciphertext
	if _, err := decryptor.Decrypt(ctx, "", "ciphertext"); err == nil {
		t.Fatal("expected error on empty admin_user_id")
	}
	if _, err := decryptor.Decrypt(ctx, "user-id", "invalid-base64"); err == nil {
		t.Fatal("expected error on invalid ciphertext")
	}
}
