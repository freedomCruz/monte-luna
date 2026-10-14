package postgres

import (
	"context"
	"database/sql"
	"errors"
	"strings"

	_ "github.com/jackc/pgx/v5/stdlib"
)

// Open opens and verifies a PostgreSQL connection. Errors never include the
// connection string, because it may contain credentials.
func Open(ctx context.Context, databaseURL string) (*sql.DB, error) {
	if strings.TrimSpace(databaseURL) == "" {
		return nil, errors.New("DATABASE_URL is required")
	}
	db, err := sql.Open("pgx", databaseURL)
	if err != nil {
		return nil, errors.New("DATABASE_URL must be a valid PostgreSQL connection string")
	}
	if err := db.PingContext(ctx); err != nil {
		_ = db.Close()
		return nil, errors.New("could not connect to PostgreSQL using DATABASE_URL")
	}
	return db, nil
}
