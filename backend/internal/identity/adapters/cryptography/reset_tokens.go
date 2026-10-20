package cryptography

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"io"

	"github.com/freedomCruz/monte-luna/backend/internal/identity/domain"
)

type ResetTokens struct{ random io.Reader }

func NewResetTokens(random io.Reader) *ResetTokens {
	if random == nil {
		random = rand.Reader
	}
	return &ResetTokens{random}
}
func (t *ResetTokens) Generate() (string, string, error) {
	data := make([]byte, 32)
	if _, err := io.ReadFull(t.random, data); err != nil {
		return "", "", errors.New("reset token entropy unavailable")
	}
	raw := base64.RawURLEncoding.EncodeToString(data)
	hash, _ := t.Hash(raw)
	return raw, hash, nil
}
func (t *ResetTokens) Hash(raw string) (string, error) {
	if len(raw) != 43 {
		return "", domain.ErrInvalidResetToken
	}
	decoded, err := base64.RawURLEncoding.Strict().DecodeString(raw)
	if err != nil || len(decoded) != 32 {
		return "", domain.ErrInvalidResetToken
	}
	sum := sha256.Sum256([]byte(raw))
	return hex.EncodeToString(sum[:]), nil
}
