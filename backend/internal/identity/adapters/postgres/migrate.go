// Package postgres owns schema-qualified identity persistence and migrations.
package postgres

import (
	"context"
	"database/sql"
	"embed"
	"fmt"
	"io/fs"

	"github.com/pressly/goose/v3"
)

//go:embed migrations/*.sql
var migrationFiles embed.FS

func Migrate(ctx context.Context, db *sql.DB) error {
	provider, err := migrationProvider(ctx, db)
	if err != nil {
		return err
	}
	if _, err := provider.Up(ctx); err != nil {
		return fmt.Errorf("apply identity migrations: %w", err)
	}
	return nil
}

// Down is for isolated migration round-trip tests, never production commands.
func Down(ctx context.Context, db *sql.DB) error {
	provider, err := migrationProvider(ctx, db)
	if err != nil {
		return err
	}
	if _, err := provider.DownTo(ctx, 0); err != nil {
		return fmt.Errorf("roll back identity migrations: %w", err)
	}
	return nil
}
func migrationProvider(ctx context.Context, db *sql.DB) (*goose.Provider, error) {
	if _, err := db.ExecContext(ctx, "CREATE SCHEMA IF NOT EXISTS identity"); err != nil {
		return nil, fmt.Errorf("create identity schema: %w", err)
	}
	files, err := fs.Sub(migrationFiles, "migrations")
	if err != nil {
		return nil, fmt.Errorf("open identity migrations: %w", err)
	}
	provider, err := goose.NewProvider(goose.DialectPostgres, db, files, goose.WithTableName("identity.goose_db_version"))
	if err != nil {
		return nil, fmt.Errorf("configure identity migrations: %w", err)
	}
	return provider, nil
}
