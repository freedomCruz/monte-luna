package postgres

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"net/netip"
	"reflect"
	"slices"
	"time"

	"github.com/freedomCruz/monte-luna/backend/internal/identity/adapters/cryptography"
	identitysql "github.com/freedomCruz/monte-luna/backend/internal/identity/adapters/postgres/sqlc"
	"github.com/freedomCruz/monte-luna/backend/internal/identity/domain"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
)

var _ domain.AdminRepository = (*Repository)(nil)

type adminTx struct{ q *identitysql.Queries }

// Manage serializes lifecycle mutations before reading either actor or target.
// Session/owner authorization is rechecked inside this transaction by app, so
// concurrent disabling or demotion cannot race an already-authorized mutation.
func (r *Repository) Manage(ctx context.Context, fn func(domain.AdminTx) error) error {
	if fn == nil {
		return domain.ErrValidation
	}
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return mapError(err)
	}
	defer func() { _ = tx.Rollback(ctx) }()
	if err := lockUsers(ctx, tx); err != nil {
		return err
	}
	if err := fn(&adminTx{identitysql.New(tx)}); err != nil {
		return err
	}
	return mapCommit(tx.Commit(ctx))
}
func (t *adminTx) Get(ctx context.Context, id string) (domain.AuthState, error) {
	if id == "" {
		return domain.AuthState{}, domain.ErrNotFound
	}
	row, err := t.q.GetAdminForUpdate(ctx, id)
	if err != nil {
		return domain.AuthState{}, mapError(err)
	}
	return loadAuth(ctx, t.q, fromRow(row))
}
func (t *adminTx) FindByEmail(ctx context.Context, email string) (domain.AuthState, error) {
	row, err := t.q.FindAdminByEmailForUpdate(ctx, email)
	if err != nil {
		return domain.AuthState{}, mapError(err)
	}
	return loadAuth(ctx, t.q, fromRow(row))
}

// List accepts one record beyond the public page maximum for next-page lookahead.
func (t *adminTx) List(ctx context.Context, after string, limit int) ([]domain.AdminRecord, error) {
	if limit < 1 || limit > 101 {
		return nil, domain.ErrValidation
	}
	var cursor pgtype.UUID
	if after != "" {
		if err := cursor.Scan(after); err != nil {
			return nil, domain.ErrValidation
		}
	}
	rows, err := t.q.ListManagedAdmins(ctx, identitysql.ListManagedAdminsParams{AfterID: cursor, PageLimit: int32(limit)})
	if err != nil {
		return nil, mapError(err)
	}
	out := make([]domain.AdminRecord, 0, len(rows))
	for _, row := range rows {
		out = append(out, domain.AdminRecord{User: fromRow(row.IdentityAdminUser), TOTPConfirmedAt: nullableTime(row.TotpConfirmedAt)})
	}
	return out, nil
}
func (t *adminTx) CountUsers(ctx context.Context) (int64, error) {
	n, err := t.q.CountAdmins(ctx)
	if err != nil {
		return 0, mapError(err)
	}
	return n, nil
}
func (t *adminTx) CountActiveOwners(ctx context.Context) (int64, error) {
	n, err := t.q.CountActiveOwners(ctx)
	if err != nil {
		return 0, mapError(err)
	}
	return n, nil
}
func (t *adminTx) Create(ctx context.Context, u domain.User) (domain.User, error) {
	valid, err := domain.NewUser(u.Email, u.DisplayName, u.Role, u.Status)
	if err != nil {
		return domain.User{}, err
	}
	if _, _, err := cryptography.NewHasher(nil).Verify("", u.PasswordHash); err != nil {
		return domain.User{}, domain.ErrValidation
	}
	n, err := t.CountActiveOwners(ctx)
	if err != nil {
		return domain.User{}, err
	}
	if n == 0 && (u.Role != domain.Owner || u.Status != domain.Active) {
		return domain.User{}, domain.ErrLastActiveOwner
	}
	row, err := t.q.CreateAdmin(ctx, identitysql.CreateAdminParams{Email: valid.Email, DisplayName: valid.DisplayName, Role: string(u.Role), Status: string(u.Status), PasswordHash: u.PasswordHash})
	if err != nil {
		return domain.User{}, mapError(err)
	}
	return fromRow(row), nil
}
func (t *adminTx) SaveUser(ctx context.Context, u domain.User, expected int32) (domain.User, error) {
	if expected < 1 {
		return domain.User{}, domain.ErrVersionConflict
	}
	row, err := t.q.UpdateManagedAdmin(ctx, identitysql.UpdateManagedAdminParams{ID: u.ID, Email: u.Email, DisplayName: u.DisplayName, Role: string(u.Role), Status: string(u.Status), PasswordHash: u.PasswordHash, PasswordChangedAt: pgtype.Timestamptz{Time: u.PasswordChangedAt, Valid: true}, SessionVersion: u.SessionVersion, FailedLoginAttempts: u.FailedLoginAttempts, LockedUntil: timeValue(u.LockedUntil), LastLoginAt: timeValue(u.LastLoginAt), Version: expected})
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.User{}, domain.ErrVersionConflict
	}
	if err != nil {
		return domain.User{}, mapError(err)
	}
	return fromRow(row), nil
}

// SaveProof persists only an actor's authentication mutations; no lifecycle
// fields can be changed. Removal from the unused set means single-use consume.
func (t *adminTx) SaveProof(ctx context.Context, s domain.AuthState) error {
	before, err := t.Get(ctx, s.User.ID)
	if err != nil {
		return err
	}
	if !reflect.DeepEqual(before.User, s.User) {
		if err := t.q.SaveAuthUser(ctx, identitysql.SaveAuthUserParams{ID: s.User.ID, PasswordHash: s.User.PasswordHash, FailedLoginAttempts: s.User.FailedLoginAttempts, LockedUntil: timeValue(s.User.LockedUntil), LastLoginAt: timeValue(s.User.LastLoginAt)}); err != nil {
			return mapError(err)
		}
	}
	if !reflect.DeepEqual(before.TOTP, s.TOTP) && len(s.TOTP.SecretEncrypted) > 0 {
		if err := t.q.SaveTOTP(ctx, identitysql.SaveTOTPParams{AdminUserID: s.User.ID, SecretEncrypted: s.TOTP.SecretEncrypted, ConfirmedAt: timeValue(s.TOTP.ConfirmedAt), LastUsedStep: s.TOTP.LastUsedStep}); err != nil {
			return mapError(err)
		}
	}
	for _, h := range before.RecoveryHashes {
		if !slices.Contains(s.RecoveryHashes, h) {
			if err := t.q.UseRecoveryCode(ctx, identitysql.UseRecoveryCodeParams{AdminUserID: s.User.ID, CodeHash: h}); err != nil {
				return mapError(err)
			}
		}
	}
	for _, e := range s.Events {
		if err := insertAuthEvent(ctx, t.q, s.User.ID, e); err != nil {
			return err
		}
	}
	return nil
}
func (t *adminTx) ResetTOTP(ctx context.Context, id string) error {
	if err := t.q.DeleteTOTP(ctx, id); err != nil {
		return mapError(err)
	}
	return mapCommit(t.q.DeleteRecoveryCodes(ctx, id))
}
func (t *adminTx) InvalidateTokens(ctx context.Context, id string, now time.Time) error {
	return mapCommit(t.q.InvalidatePasswordTokens(ctx, identitysql.InvalidatePasswordTokensParams{AdminUserID: id, UsedAt: pgtype.Timestamptz{Time: now, Valid: true}}))
}
func (t *adminTx) InsertToken(ctx context.Context, token domain.PasswordToken) error {
	if !validTokenHash(token.Hash) || token.CreatedAt.IsZero() || !token.ExpiresAt.Equal(token.CreatedAt.Add(domain.PasswordResetLifetime)) {
		return domain.ErrValidation
	}
	at := pgtype.Timestamptz{Time: token.CreatedAt, Valid: true}
	if err := t.InvalidateTokens(ctx, token.UserID, token.CreatedAt); err != nil {
		return err
	}
	return mapCommit(t.q.CreatePasswordToken(ctx, identitysql.CreatePasswordTokenParams{AdminUserID: token.UserID, TokenHash: token.Hash, CreatedAt: at, ExpiresAt: pgtype.Timestamptz{Time: token.ExpiresAt, Valid: true}}))
}
func (t *adminTx) InsertTokenEvent(ctx context.Context, event domain.TokenEvent) error {
	if event.Type != "identity.admin_invited" && event.Type != "identity.password_reset_requested" {
		return domain.ErrValidation
	}
	// Invitations must name the assigned fixed role; reset events never carry one.
	invited := event.Type == "identity.admin_invited"
	if invited != (event.Payload.Role == domain.Owner || event.Payload.Role == domain.Staff) || (!invited && event.Payload.Role != "") {
		return domain.ErrValidation
	}
	encrypted, err := base64.StdEncoding.Strict().DecodeString(event.Payload.RawTokenEncrypted)
	if err != nil || len(encrypted) < 28 || event.OccurredAt.IsZero() {
		return domain.ErrValidation
	}
	payload, err := json.Marshal(event.Payload)
	if err != nil {
		return domain.ErrValidation
	}
	return mapCommit(t.q.InsertIdentityTokenEvent(ctx, identitysql.InsertIdentityTokenEventParams{Type: event.Type, Payload: payload, OccurredAt: pgtype.Timestamptz{Time: event.OccurredAt, Valid: true}}))
}
func (t *adminTx) Audit(ctx context.Context, event domain.SecurityEvent) error {
	var id pgtype.UUID
	if event.UserID != "" {
		if err := id.Scan(event.UserID); err != nil {
			return domain.ErrValidation
		}
	}
	if event.Metadata.TargetID != "" {
		var target pgtype.UUID
		if err := target.Scan(event.Metadata.TargetID); err != nil {
			return domain.ErrValidation
		}
	}
	if event.Metadata.Source != "" && event.Metadata.Source != "cli" {
		return domain.ErrValidation
	}
	if event.Metadata.Outcome != "" && event.Metadata.Outcome != "failed" && event.Metadata.Outcome != "succeeded" {
		return domain.ErrValidation
	}
	var ip *netip.Addr
	if event.Context.IP != "" {
		address, err := netip.ParseAddr(event.Context.IP)
		if err != nil {
			return domain.ErrValidation
		}
		ip = &address
	}
	var ua *string
	if event.Context.UserAgent != "" {
		ua = &event.Context.UserAgent
	}
	metadata, err := json.Marshal(event.Metadata)
	if err != nil {
		return domain.ErrValidation
	}
	at := pgtype.Timestamptz{}
	if !event.CreatedAt.IsZero() {
		at = pgtype.Timestamptz{Time: event.CreatedAt, Valid: true}
	}
	return mapCommit(t.q.InsertSecurityEvent(ctx, identitysql.InsertSecurityEventParams{AdminUserID: id, EventType: event.Type, IpAddress: ip, UserAgent: ua, Metadata: metadata, EventTime: at}))
}
func (r *Repository) DeleteOldSecurityEvents(ctx context.Context, now time.Time, batch int32) (int64, error) {
	if batch < 1 || batch > 10000 || now.IsZero() {
		return 0, domain.ErrValidation
	}
	n, err := identitysql.New(r.pool).DeleteOldSecurityEvents(ctx, identitysql.DeleteOldSecurityEventsParams{ReferenceTime: pgtype.Timestamptz{Time: now, Valid: true}, BatchSize: batch})
	if err != nil {
		return 0, mapError(err)
	}
	return n, nil
}
