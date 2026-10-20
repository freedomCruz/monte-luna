package postgres

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/freedomCruz/monte-luna/backend/internal/identity/adapters/cryptography"
	identitysql "github.com/freedomCruz/monte-luna/backend/internal/identity/adapters/postgres/sqlc"
	"github.com/freedomCruz/monte-luna/backend/internal/identity/domain"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Repository struct{ pool *pgxpool.Pool }

var _ domain.UserRepository = (*Repository)(nil)

func NewRepository(pool *pgxpool.Pool) *Repository { return &Repository{pool: pool} }

// Create is an internal prehashed persistence primitive, not the invitation use
// case. Owner authorization and atomic invitation/outbox creation belong to app.
func (r *Repository) Create(ctx context.Context, input domain.User) (domain.User, error) {
	user, err := domain.NewUser(input.Email, input.DisplayName, input.Role, input.Status)
	if err != nil {
		return domain.User{}, err
	}
	if _, _, err := cryptography.NewHasher(nil).Verify("", input.PasswordHash); err != nil {
		return domain.User{}, domain.ErrValidation
	}
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return domain.User{}, fmt.Errorf("begin identity creation: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()
	if err := lockUsers(ctx, tx); err != nil {
		return domain.User{}, err
	}
	q := identitysql.New(tx)
	owners, err := q.CountActiveOwners(ctx)
	if err != nil {
		return domain.User{}, fmt.Errorf("count active owners: %w", err)
	}
	if owners == 0 && (user.Role != domain.Owner || user.Status != domain.Active) {
		return domain.User{}, domain.ErrLastActiveOwner
	}
	row, err := q.CreateAdmin(ctx, identitysql.CreateAdminParams{Email: user.Email, DisplayName: user.DisplayName, Role: string(user.Role), Status: string(user.Status), PasswordHash: input.PasswordHash})
	if err != nil {
		return domain.User{}, mapError(err)
	}
	if err := tx.Commit(ctx); err != nil {
		return domain.User{}, fmt.Errorf("commit identity creation: %w", err)
	}
	return fromRow(row), nil
}
func (r *Repository) Get(ctx context.Context, id string) (domain.User, error) {
	row, err := identitysql.New(r.pool).GetAdmin(ctx, id)
	if err != nil {
		return domain.User{}, mapError(err)
	}
	return fromRow(row), nil
}
func (r *Repository) FindByEmail(ctx context.Context, email string) (domain.User, error) {
	row, err := identitysql.New(r.pool).FindAdminByEmail(ctx, strings.ToLower(strings.TrimSpace(email)))
	if err != nil {
		return domain.User{}, mapError(err)
	}
	return fromRow(row), nil
}
func (r *Repository) List(ctx context.Context, after string, limit int) ([]domain.User, error) {
	if limit < 1 || limit > 100 {
		return nil, domain.ErrValidation
	}
	var cursor pgtype.UUID
	if after != "" {
		if err := cursor.Scan(after); err != nil {
			return nil, domain.ErrValidation
		}
	}
	rows, err := identitysql.New(r.pool).ListAdmins(ctx, identitysql.ListAdminsParams{AfterID: cursor, PageLimit: int32(limit)})
	if err != nil {
		return nil, mapError(err)
	}
	users := make([]domain.User, 0, len(rows))
	for _, row := range rows {
		users = append(users, fromRow(row))
	}
	return users, nil
}

// Update serializes all lifecycle writers before reading the owner count. A
// table lock also protects the empty-table bootstrap case, unlike locking only
// existing owner rows. No HTTP caller can bypass the domain last-owner check.
func (r *Repository) Update(ctx context.Context, id string, expected int32, changes domain.UserChanges) (domain.User, error) {
	if expected < 1 {
		return domain.User{}, domain.ErrVersionConflict
	}
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return domain.User{}, fmt.Errorf("begin identity update: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()
	if err := lockUsers(ctx, tx); err != nil {
		return domain.User{}, err
	}
	q := identitysql.New(tx)
	row, err := q.GetAdminForUpdate(ctx, id)
	if err != nil {
		return domain.User{}, mapError(err)
	}
	if row.Version != expected {
		return domain.User{}, domain.ErrVersionConflict
	}
	owners, err := q.CountActiveOwners(ctx)
	if err != nil {
		return domain.User{}, fmt.Errorf("count active owners: %w", err)
	}
	updated, err := fromRow(row).Apply(changes, int(owners))
	if err != nil {
		return domain.User{}, err
	}
	row, err = q.UpdateAdmin(ctx, identitysql.UpdateAdminParams{ID: id, Email: updated.Email, DisplayName: updated.DisplayName, Role: string(updated.Role), Status: string(updated.Status), SessionVersion: updated.SessionVersion, Version: expected})
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.User{}, domain.ErrVersionConflict
	}
	if err != nil {
		return domain.User{}, mapError(err)
	}
	if err := tx.Commit(ctx); err != nil {
		return domain.User{}, fmt.Errorf("commit identity update: %w", err)
	}
	return fromRow(row), nil
}
func lockUsers(ctx context.Context, tx pgx.Tx) error {
	if _, err := tx.Exec(ctx, `LOCK TABLE identity.admin_users IN SHARE ROW EXCLUSIVE MODE`); err != nil {
		return fmt.Errorf("lock identity lifecycle: %w", err)
	}
	return nil
}
func mapError(err error) error {
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.ErrNotFound
	}
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) {
		if pgErr.Code == "23505" && pgErr.ConstraintName == "admin_users_email_key" {
			return domain.ErrEmailConflict
		}
		if pgErr.Code == "22P02" || pgErr.Code == "23514" {
			return domain.ErrValidation
		}
	}
	return fmt.Errorf("identity persistence: %w", err)
}
func fromRow(row identitysql.IdentityAdminUser) domain.User {
	return domain.User{ID: row.ID, Email: row.Email, DisplayName: row.DisplayName, Role: domain.Role(row.Role), Status: domain.Status(row.Status), PasswordHash: row.PasswordHash, PasswordChangedAt: row.PasswordChangedAt.Time, SessionVersion: row.SessionVersion, FailedLoginAttempts: row.FailedLoginAttempts, LockedUntil: nullableTime(row.LockedUntil), LastLoginAt: nullableTime(row.LastLoginAt), Version: row.Version, CreatedAt: row.CreatedAt.Time, UpdatedAt: row.UpdatedAt.Time}
}
func nullableTime(value pgtype.Timestamptz) *time.Time {
	if !value.Valid {
		return nil
	}
	return &value.Time
}
