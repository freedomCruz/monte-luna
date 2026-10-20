package app

import (
	"context"
	"encoding/base64"
	"errors"
	"net/mail"
	"strings"
	"time"

	"github.com/freedomCruz/monte-luna/backend/internal/identity/domain"
)

type PasswordResets struct {
	repo      domain.PasswordResetRepository
	passwords domain.Passwords
	cipher    domain.SecretCipher
	tokens    domain.ResetTokens
	limiter   domain.AuthLimiter
	now       func() time.Time
	policy    domain.PasswordPolicy
}

func NewPasswordResets(repo domain.PasswordResetRepository, passwords domain.Passwords, cipher domain.SecretCipher, tokens domain.ResetTokens, limiter domain.AuthLimiter, now func() time.Time, policy domain.PasswordPolicy) (*PasswordResets, error) {
	if repo == nil || passwords == nil || cipher == nil || tokens == nil || limiter == nil || now == nil || policy == nil {
		return nil, domain.ErrValidation
	}
	return &PasswordResets{repo, passwords, cipher, tokens, limiter, now, policy}, nil
}
func (p *PasswordResets) limit(ctx context.Context, account, ip string) error {
	delay, err := p.limiter.Allow(ctx, account, ip, p.now())
	if err != nil {
		return domain.ErrResetUnavailable
	}
	if delay > 0 {
		return &domain.RateLimitError{RetryAfter: delay}
	}
	return nil
}

// Request returns the same nil acknowledgement for eligible, unknown and
// disabled accounts. Delivery is asynchronous, never inferred from this result.
func (p *PasswordResets) Request(ctx context.Context, email, ip string) error {
	email = strings.ToLower(strings.TrimSpace(email))
	address, err := mail.ParseAddress(email)
	if err != nil || address.Address != email {
		return domain.ErrValidation
	}
	if err := p.limit(ctx, email, ip); err != nil {
		return err
	}
	err = p.repo.IssuePasswordReset(ctx, email, p.now(), func(user domain.User) (domain.PasswordResetIssue, error) {
		raw, hash, err := p.tokens.Generate()
		if err != nil {
			return domain.PasswordResetIssue{}, domain.ErrResetUnavailable
		}
		encrypted, err := p.cipher.Seal([]byte(raw), domain.PasswordResetPurpose(user.ID))
		if err != nil {
			return domain.PasswordResetIssue{}, domain.ErrResetUnavailable
		}
		return domain.PasswordResetIssue{TokenHash: hash, RawTokenEncrypted: base64.StdEncoding.EncodeToString(encrypted)}, nil
	})
	if err != nil {
		return domain.ErrResetUnavailable
	}
	return nil
}

// Complete also consumes invitation tokens from the same canonical table.
// It returns neither a user nor a session; mandatory TOTP state is untouched.
func (p *PasswordResets) Complete(ctx context.Context, raw, password, ip string) error {
	hash, tokenErr := p.tokens.Hash(raw)
	account := "password-reset-invalid:" + ip
	var lookupErr error
	if tokenErr == nil {
		var known string
		known, lookupErr = p.repo.PasswordResetAccount(ctx, hash, p.now())
		if lookupErr == nil {
			account = known
		}
	}
	// Invalid tokens still consume the IP limiter; valid tokens additionally use
	// their real account key. Hashes and raw tokens are never limiter identifiers.
	if err := p.limit(ctx, account, ip); err != nil {
		return err
	}
	if tokenErr != nil || errors.Is(lookupErr, domain.ErrInvalidResetToken) {
		return domain.ErrInvalidResetToken
	}
	if lookupErr != nil {
		return domain.ErrResetUnavailable
	}
	if password == "" || p.policy(password) != nil {
		return domain.ErrValidation
	}
	encoded, err := p.passwords.Hash(password)
	if err != nil {
		return domain.ErrResetUnavailable
	}
	err = p.repo.CompletePasswordReset(ctx, hash, encoded, p.now(), ip)
	if errors.Is(err, domain.ErrInvalidResetToken) {
		return domain.ErrInvalidResetToken
	}
	if err != nil {
		return domain.ErrResetUnavailable
	}
	return nil
}
