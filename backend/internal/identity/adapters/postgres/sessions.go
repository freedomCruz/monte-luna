package postgres

import (
	"context"
	"errors"
	"time"

	"github.com/alexedwards/scs/v2"
	identitysql "github.com/freedomCruz/monte-luna/backend/internal/identity/adapters/postgres/sqlc"
	"github.com/freedomCruz/monte-luna/backend/internal/identity/domain"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
)

// SessionStore has no cleanup goroutine; I1 schedules bounded DeleteExpired
// calls alongside the application's other periodic maintenance jobs.
type SessionStore struct{ pool *pgxpool.Pool }

var _ scs.CtxStore = (*SessionStore)(nil)

func NewSessionStore(pool *pgxpool.Pool) *SessionStore { return &SessionStore{pool: pool} }
func (s *SessionStore) Find(token string) ([]byte, bool, error) {
	return s.FindCtx(context.Background(), token)
}
func (s *SessionStore) Delete(token string) error { return s.DeleteCtx(context.Background(), token) }
func (s *SessionStore) Commit(token string, data []byte, expiry time.Time) error {
	return s.CommitCtx(context.Background(), token, data, expiry)
}
func (s *SessionStore) FindCtx(ctx context.Context, token string) ([]byte, bool, error) {
	data, err := identitysql.New(s.pool).FindSession(ctx, token)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, false, nil
	}
	if err != nil {
		return nil, false, mapError(err)
	}
	return data, true, nil
}
func (s *SessionStore) DeleteCtx(ctx context.Context, token string) error {
	return mapCommit(identitysql.New(s.pool).DeleteSession(ctx, token))
}
func (s *SessionStore) CommitCtx(ctx context.Context, token string, data []byte, expiry time.Time) error {
	return mapCommit(identitysql.New(s.pool).CommitSession(ctx, identitysql.CommitSessionParams{Token: token, Data: data, Expiry: pgtype.Timestamptz{Time: expiry, Valid: true}}))
}
func (s *SessionStore) DeleteExpired(ctx context.Context, batch int32) (int64, error) {
	if batch < 1 || batch > 10000 {
		return 0, domain.ErrValidation
	}
	n, err := identitysql.New(s.pool).DeleteExpiredSessions(ctx, batch)
	if err != nil {
		return 0, mapError(err)
	}
	return n, nil
}
