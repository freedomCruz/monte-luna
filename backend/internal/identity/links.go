package identity

import (
	"context"
	"encoding/base64"
	"errors"

	"github.com/freedomCruz/monte-luna/backend/internal/identity/adapters/cryptography"
	"github.com/freedomCruz/monte-luna/backend/internal/identity/domain"
)

// One-time token event types whose links this facade builds.
const (
	PasswordResetRequested = "identity.password_reset_requested"
	AdminInvited           = "identity.admin_invited"
)

// ErrInvalidOneTimeToken never carries token, ciphertext, or link material.
var ErrInvalidOneTimeToken = errors.New("invalid one-time token")

// OneTimeLinks is the only way other modules turn Identity token events into
// email links. Tokens exist only in memory; nothing here persists or logs.
//
// Expected use by the Notifications consumer for one outbox event:
//
//	token, err := links.Decrypt(ctx, payload.AdminUserID, payload.RawTokenEncrypted)
//	link, err := links.Build(ctx, event.Type, token)
//
// The ciphertext is authenticated with "identity.password-token:<admin_user_id>",
// so decryption needs the event's admin_user_id. A Notifications adapter whose
// port is Decrypt(ctx, encrypted) can bind it per event with ForAdmin:
//
//	token, err := links.ForAdmin(payload.AdminUserID).Decrypt(ctx, payload.RawTokenEncrypted)
//
// Build already matches LinkBuilder.Build(ctx, eventType, token).
type OneTimeLinks struct {
	cipher *cryptography.Cipher
	tokens *cryptography.ResetTokens
	base   string
}

func NewOneTimeLinks(cfg Config) (*OneTimeLinks, error) {
	if err := cfg.Validate(); err != nil {
		return nil, err
	}
	cipher, err := cryptography.NewCipher(cfg.EncryptionKey, nil)
	if err != nil {
		return nil, err
	}
	return &OneTimeLinks{cipher: cipher, tokens: cryptography.NewResetTokens(nil), base: cfg.StorefrontBaseURL}, nil
}

// Decrypt opens raw_token_encrypted from either token event payload.
func (l *OneTimeLinks) Decrypt(ctx context.Context, adminUserID, encrypted string) (string, error) {
	if err := ctx.Err(); err != nil {
		return "", err
	}
	if adminUserID == "" {
		return "", ErrInvalidOneTimeToken
	}
	sealed, err := base64.StdEncoding.Strict().DecodeString(encrypted)
	if err != nil {
		return "", ErrInvalidOneTimeToken
	}
	raw, err := l.cipher.Open(sealed, domain.PasswordResetPurpose(adminUserID))
	if err != nil {
		return "", ErrInvalidOneTimeToken
	}
	token := string(raw)
	if _, err := l.tokens.Hash(token); err != nil {
		return "", ErrInvalidOneTimeToken
	}
	return token, nil
}

// Build returns {STOREFRONT_BASE_URL}/admin/restablecer-contrasena#token=<token>
// or {STOREFRONT_BASE_URL}/admin/invitacion#token=<token>. The fragment keeps
// the token out of server logs and the Referer header.
func (l *OneTimeLinks) Build(ctx context.Context, eventType, token string) (string, error) {
	if err := ctx.Err(); err != nil {
		return "", err
	}
	if _, err := l.tokens.Hash(token); err != nil {
		return "", ErrInvalidOneTimeToken
	}
	switch eventType {
	case PasswordResetRequested:
		return l.base + "/admin/restablecer-contrasena#token=" + token, nil
	case AdminInvited:
		return l.base + "/admin/invitacion#token=" + token, nil
	default:
		return "", ErrInvalidOneTimeToken
	}
}

// AdminDecryptor binds one event's administrator for single-argument ports.
type AdminDecryptor struct {
	links       *OneTimeLinks
	adminUserID string
}

func (l *OneTimeLinks) ForAdmin(adminUserID string) AdminDecryptor {
	return AdminDecryptor{l, adminUserID}
}
func (d AdminDecryptor) Decrypt(ctx context.Context, encrypted string) (string, error) {
	return d.links.Decrypt(ctx, d.adminUserID, encrypted)
}
