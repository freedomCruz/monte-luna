package postgres

import (
	"context"
	"errors"
	"net/netip"
	"reflect"
	"slices"
	"time"

	identitysql "github.com/freedomCruz/monte-luna/backend/internal/identity/adapters/postgres/sqlc"
	"github.com/freedomCruz/monte-luna/backend/internal/identity/domain"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
)

var _ domain.AuthRepository = (*Repository)(nil)

func loadAuth(ctx context.Context, q *identitysql.Queries, user domain.User) (domain.AuthState, error) {
	s := domain.AuthState{User: user}
	credential, err := q.GetTOTP(ctx, user.ID)
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return s, mapError(err)
	}
	if err == nil {
		s.TOTP = domain.TOTPCredential{SecretEncrypted: credential.SecretEncrypted, ConfirmedAt: nullableTime(credential.ConfirmedAt), LastUsedStep: credential.LastUsedStep}
	}
	s.RecoveryHashes, err = q.ListUnusedRecoveryHashes(ctx, user.ID)
	if err != nil {
		return s, mapError(err)
	}
	return s, nil
}
func (r *Repository) ReadAuth(ctx context.Context, id string) (domain.AuthState, error) {
	// A consistent read prevents mixing pre-reset users with post-reset TOTP.
	tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.RepeatableRead, AccessMode: pgx.ReadOnly})
	if err != nil {
		return domain.AuthState{}, mapError(err)
	}
	defer func() { _ = tx.Rollback(ctx) }()
	q := identitysql.New(tx)
	row, err := q.GetAdmin(ctx, id)
	if err != nil {
		return domain.AuthState{}, mapError(err)
	}
	s, err := loadAuth(ctx, q, fromRow(row))
	if err != nil {
		return domain.AuthState{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return domain.AuthState{}, mapError(err)
	}
	return s, nil
}
func (r *Repository) TransactAuth(ctx context.Context, lookup domain.AuthLookup, fn func(*domain.AuthState) error) error {
	if (lookup.ID == "") == (lookup.Email == "") || fn == nil {
		return domain.ErrValidation
	}
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return mapError(err)
	}
	defer func() { _ = tx.Rollback(ctx) }()
	// Match the lifecycle writer's table-before-row lock order. Without this,
	// a lifecycle update can hold its table lock while waiting for our row,
	// while our later UPDATE waits for that same table lock.
	if _, err := tx.Exec(ctx, `LOCK TABLE identity.admin_users IN ROW EXCLUSIVE MODE`); err != nil {
		return mapError(err)
	}
	q := identitysql.New(tx)
	var row identitysql.IdentityAdminUser
	if lookup.ID != "" {
		row, err = q.GetAdminForUpdate(ctx, lookup.ID)
	} else {
		row, err = q.FindAdminByEmailForUpdate(ctx, lookup.Email)
	}
	if err != nil {
		return mapError(err)
	}
	s, err := loadAuth(ctx, q, fromRow(row))
	if err != nil {
		return err
	}
	beforeUser := s.User
	beforeTOTP := s.TOTP
	beforeTOTP.SecretEncrypted = slices.Clone(s.TOTP.SecretEncrypted)
	if beforeTOTP.LastUsedStep != nil {
		step := *beforeTOTP.LastUsedStep
		beforeTOTP.LastUsedStep = &step
	}
	if beforeTOTP.ConfirmedAt != nil {
		confirmed := *beforeTOTP.ConfirmedAt
		beforeTOTP.ConfirmedAt = &confirmed
	}
	beforeHashes := slices.Clone(s.RecoveryHashes)
	if err := fn(&s); err != nil {
		return err
	}
	// This transaction only owns authentication fields, never lifecycle/roles.
	if !reflect.DeepEqual(beforeUser, s.User) {
		if err := q.SaveAuthUser(ctx, identitysql.SaveAuthUserParams{ID: row.ID, PasswordHash: s.User.PasswordHash, FailedLoginAttempts: s.User.FailedLoginAttempts, LockedUntil: timeValue(s.User.LockedUntil), LastLoginAt: timeValue(s.User.LastLoginAt)}); err != nil {
			return mapError(err)
		}
	}
	if !reflect.DeepEqual(beforeTOTP, s.TOTP) && len(s.TOTP.SecretEncrypted) > 0 {
		if err := q.SaveTOTP(ctx, identitysql.SaveTOTPParams{AdminUserID: row.ID, SecretEncrypted: s.TOTP.SecretEncrypted, ConfirmedAt: timeValue(s.TOTP.ConfirmedAt), LastUsedStep: s.TOTP.LastUsedStep}); err != nil {
			return mapError(err)
		}
	}
	if !slices.Equal(beforeHashes, s.RecoveryHashes) {
		// New hashes mean regeneration; consumed hashes otherwise retain used_at.
		regenerated := false
		for _, h := range s.RecoveryHashes {
			if !slices.Contains(beforeHashes, h) {
				regenerated = true
				break
			}
		}
		if regenerated {
			if err := q.DeleteRecoveryCodes(ctx, row.ID); err != nil {
				return mapError(err)
			}
			for _, h := range s.RecoveryHashes {
				if err := q.CreateRecoveryCode(ctx, identitysql.CreateRecoveryCodeParams{AdminUserID: row.ID, CodeHash: h}); err != nil {
					return mapError(err)
				}
			}
		} else {
			for _, h := range beforeHashes {
				if !slices.Contains(s.RecoveryHashes, h) {
					if err := q.UseRecoveryCode(ctx, identitysql.UseRecoveryCodeParams{AdminUserID: row.ID, CodeHash: h}); err != nil {
						return mapError(err)
					}
				}
			}
		}
	}
	for _, event := range s.Events {
		if err := insertAuthEvent(ctx, q, row.ID, event); err != nil {
			return err
		}
	}
	return mapCommit(tx.Commit(ctx))
}
func timeValue(value *time.Time) pgtype.Timestamptz {
	if value == nil {
		return pgtype.Timestamptz{}
	}
	return pgtype.Timestamptz{Time: *value, Valid: true}
}
func mapCommit(err error) error {
	if err != nil {
		return mapError(err)
	}
	return nil
}
func insertAuthEvent(ctx context.Context, q *identitysql.Queries, id string, event domain.AuthEvent) error {
	var user pgtype.UUID
	if id != "" {
		if err := user.Scan(id); err != nil {
			return domain.ErrValidation
		}
	}
	var ip *netip.Addr
	if event.IP != "" {
		address, err := netip.ParseAddr(event.IP)
		if err != nil {
			return domain.ErrValidation
		}
		ip = &address
	}
	if err := q.InsertAuthEvent(ctx, identitysql.InsertAuthEventParams{AdminUserID: user, EventType: event.Type, IpAddress: ip}); err != nil {
		return mapError(err)
	}
	return nil
}
func (r *Repository) RecordAnonymousFailure(ctx context.Context, ip string) error {
	return insertAuthEvent(ctx, identitysql.New(r.pool), "", domain.AuthEvent{Type: "login_failed", IP: ip})
}
