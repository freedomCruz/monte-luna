package cryptography

import (
	"crypto/rand"
	"encoding/base64"
	"errors"
	"io"
	"strings"
	"time"

	"github.com/freedomCruz/monte-luna/backend/internal/identity/domain"
	"github.com/pquerna/otp"
	"github.com/pquerna/otp/totp"
)

type Factors struct {
	issuer string
	random io.Reader
}

var _ domain.Factors = (*Factors)(nil)

func NewFactors(issuer string, random io.Reader) (*Factors, error) {
	if strings.TrimSpace(issuer) == "" {
		return nil, domain.ErrValidation
	}
	if random == nil {
		random = rand.Reader
	}
	return &Factors{issuer, random}, nil
}
func (f *Factors) Generate(email string) (string, string, error) {
	if strings.TrimSpace(email) == "" {
		return "", "", domain.ErrValidation
	}
	key, err := totp.Generate(totp.GenerateOpts{Issuer: f.issuer, AccountName: email, Period: 30, SecretSize: 20, Digits: otp.DigitsSix, Algorithm: otp.AlgorithmSHA1, Rand: f.random})
	if err != nil {
		return "", "", errors.New("TOTP entropy unavailable")
	}
	return key.Secret(), key.URL(), nil
}
func (f *Factors) Verify(secret, code string, now time.Time) (int64, bool) {
	if now.Unix() < 0 || len(code) != 6 {
		return 0, false
	}
	for _, c := range code {
		if c < '0' || c > '9' {
			return 0, false
		}
	}
	valid, err := totp.ValidateCustom(code, secret, now, totp.ValidateOpts{Period: 30, Skew: 0, Digits: otp.DigitsSix, Algorithm: otp.AlgorithmSHA1})
	return now.Unix() / 30, err == nil && valid
}
func (f *Factors) RecoveryCodes(count, size int) ([]string, error) {
	if count < 1 || count > 100 || size < 10 || size > 128 {
		return nil, domain.ErrValidation
	}
	codes := make([]string, count)
	for i := range codes {
		raw := make([]byte, size)
		if _, err := io.ReadFull(f.random, raw); err != nil {
			return nil, errors.New("recovery entropy unavailable")
		}
		codes[i] = base64.RawURLEncoding.EncodeToString(raw)
	}
	return codes, nil
}
