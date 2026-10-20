package postgres

import (
	"context"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"time"

	"github.com/freedomCruz/monte-luna/backend/internal/identity/adapters/cryptography"
	identitysql "github.com/freedomCruz/monte-luna/backend/internal/identity/adapters/postgres/sqlc"
	"github.com/freedomCruz/monte-luna/backend/internal/identity/domain"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
)

var _ domain.PasswordResetRepository = (*Repository)(nil)

// Lock order matches authentication writers: table intent, then user row,
// then token. Requests, completion and lifecycle changes cannot interleave
// token validation with disabling/revocation or a superseding request.
func (r *Repository) IssuePasswordReset(ctx context.Context, email string, now time.Time, factory func(domain.User) (domain.PasswordResetIssue, error)) error {
	if factory == nil {
		return domain.ErrValidation
	}
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return mapError(err)
	}
	defer func() { _ = tx.Rollback(ctx) }()
	if _, err := tx.Exec(ctx, `LOCK TABLE identity.admin_users IN ROW EXCLUSIVE MODE`); err != nil {
		return mapError(err)
	}
	q := identitysql.New(tx)
	row, err := q.FindAdminByEmailForUpdate(ctx, email)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil
	}
	if err != nil {
		return mapError(err)
	}
	if row.Status != string(domain.Active) {
		return nil
	}
	issue, err := factory(fromRow(row))
	if err != nil {
		return err
	}
	encrypted, err := base64.StdEncoding.Strict().DecodeString(issue.RawTokenEncrypted)
	if err != nil || len(encrypted) < 28 || !validTokenHash(issue.TokenHash) {
		return domain.ErrValidation
	}
	at := pgtype.Timestamptz{Time: now, Valid: true}
	if err := q.InvalidatePasswordTokens(ctx, identitysql.InvalidatePasswordTokensParams{AdminUserID: row.ID, UsedAt: at}); err != nil {
		return mapError(err)
	}
	if err := q.CreatePasswordToken(ctx, identitysql.CreatePasswordTokenParams{AdminUserID: row.ID, TokenHash: issue.TokenHash, CreatedAt: at, ExpiresAt: pgtype.Timestamptz{Time: now.Add(domain.PasswordResetLifetime), Valid: true}}); err != nil {
		return mapError(err)
	}
	payload, err := json.Marshal(domain.PasswordTokenPayload{AdminUserID: row.ID, Email: row.Email, DisplayName: row.DisplayName, RawTokenEncrypted: issue.RawTokenEncrypted})
	if err != nil {
		return domain.ErrResetUnavailable
	}
	if err := q.InsertPasswordResetEvent(ctx, identitysql.InsertPasswordResetEventParams{Payload: payload, OccurredAt: at}); err != nil {
		return mapError(err)
	}
	if err := insertAuthEvent(ctx, q, row.ID, domain.AuthEvent{Type: "password_reset_requested"}); err != nil {
		return err
	}
	return mapCommit(tx.Commit(ctx))
}
func validTokenHash(hash string) bool {
	if len(hash) != 64 {
		return false
	}
	decoded, err := hex.DecodeString(hash)
	return err == nil && len(decoded) == 32
}
func (r *Repository) PasswordResetAccount(ctx context.Context, hash string, now time.Time) (string, error) {
	if !validTokenHash(hash) {
		return "", domain.ErrInvalidResetToken
	}
	email, err := identitysql.New(r.pool).PasswordResetAccount(ctx, identitysql.PasswordResetAccountParams{TokenHash: hash, ExpiresAt: pgtype.Timestamptz{Time: now, Valid: true}})
	if errors.Is(err, pgx.ErrNoRows) {
		return "", domain.ErrInvalidResetToken
	}
	if err != nil {
		return "", mapError(err)
	}
	return email, nil
}
func (r *Repository) CompletePasswordReset(ctx context.Context, hash, passwordHash string, now time.Time, ip string) error {
	if !validTokenHash(hash) {
		return domain.ErrInvalidResetToken
	}
	if _, _, err := cryptography.NewHasher(nil).Verify("", passwordHash); err != nil {
		return domain.ErrValidation
	}
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return mapError(err)
	}
	defer func() { _ = tx.Rollback(ctx) }()
	if _, err := tx.Exec(ctx, `LOCK TABLE identity.admin_users IN ROW EXCLUSIVE MODE`); err != nil {
		return mapError(err)
	}
	q := identitysql.New(tx)
	// This initial read only identifies the lock target. It never authorizes
	// consumption; the token is read again after acquiring the user row lock.
	candidate, err := q.FindPasswordToken(ctx, hash)
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.ErrInvalidResetToken
	}
	if err != nil {
		return mapError(err)
	}
	user, err := q.GetAdminForUpdate(ctx, candidate.AdminUserID)
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.ErrInvalidResetToken
	}
	if err != nil {
		return mapError(err)
	}
	token, err := q.LockPasswordToken(ctx, hash)
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.ErrInvalidResetToken
	}
	if err != nil {
		return mapError(err)
	}
	if user.Status != string(domain.Active) || token.UsedAt.Valid || !token.ExpiresAt.Time.After(now) {
		return domain.ErrInvalidResetToken
	}
	at := pgtype.Timestamptz{Time: now, Valid: true}
	if err := q.SetResetPassword(ctx, identitysql.SetResetPasswordParams{ID: user.ID, PasswordHash: passwordHash, PasswordChangedAt: at}); err != nil {
		return mapError(err)
	}
	if err := q.InvalidatePasswordTokens(ctx, identitysql.InvalidatePasswordTokensParams{AdminUserID: user.ID, UsedAt: at}); err != nil {
		return mapError(err)
	}
	if err := insertAuthEvent(ctx, q, user.ID, domain.AuthEvent{Type: "password_reset_completed", IP: ip}); err != nil {
		return err
	}
	return mapCommit(tx.Commit(ctx))
}
