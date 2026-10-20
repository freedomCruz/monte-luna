package app

import (
	"encoding/base64"
	"time"

	"github.com/freedomCruz/monte-luna/backend/internal/identity/domain"
)

// TokenIssuer reuses the canonical reset/invitation generator and AAD. It
// returns only hashes and authenticated ciphertext, never a plaintext token.
type TokenIssuer struct {
	cipher domain.SecretCipher
	random domain.ResetTokens
}

func NewTokenIssuer(cipher domain.SecretCipher, random domain.ResetTokens) (*TokenIssuer, error) {
	if cipher == nil || random == nil {
		return nil, domain.ErrValidation
	}
	return &TokenIssuer{cipher, random}, nil
}
func (t *TokenIssuer) Issue(user domain.User, eventType string, now time.Time) (domain.PasswordToken, domain.TokenEvent, error) {
	if user.ID == "" || (eventType != "identity.admin_invited" && eventType != "identity.password_reset_requested") {
		return domain.PasswordToken{}, domain.TokenEvent{}, domain.ErrValidation
	}
	raw, hash, err := t.random.Generate()
	if err != nil {
		return domain.PasswordToken{}, domain.TokenEvent{}, domain.ErrResetUnavailable
	}
	canonical, err := t.random.Hash(raw)
	if err != nil || canonical != hash {
		return domain.PasswordToken{}, domain.TokenEvent{}, domain.ErrResetUnavailable
	}
	encrypted, err := t.cipher.Seal([]byte(raw), domain.PasswordResetPurpose(user.ID))
	if err != nil {
		return domain.PasswordToken{}, domain.TokenEvent{}, domain.ErrResetUnavailable
	}
	return domain.PasswordToken{UserID: user.ID, Hash: hash, CreatedAt: now, ExpiresAt: now.Add(domain.PasswordResetLifetime)}, domain.TokenEvent{Type: eventType, OccurredAt: now, Payload: domain.PasswordTokenPayload{AdminUserID: user.ID, Email: user.Email, DisplayName: user.DisplayName, RawTokenEncrypted: base64.StdEncoding.EncodeToString(encrypted)}}, nil
}
