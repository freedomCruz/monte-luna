// Package postgres implements the Notifications persistence boundary.
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

func provider(ctx context.Context, db *sql.DB) (*goose.Provider, error) {
	if _, err := db.ExecContext(ctx, "CREATE SCHEMA IF NOT EXISTS notifications"); err != nil {
		return nil, fmt.Errorf("create notifications schema: %w", err)
	}
	files, err := fs.Sub(migrationFiles, "migrations")
	if err != nil {
		return nil, fmt.Errorf("open notifications migrations: %w", err)
	}
	p, err := goose.NewProvider(goose.DialectPostgres, db, files, goose.WithTableName("notifications.goose_db_version"))
	if err != nil {
		return nil, fmt.Errorf("configure notifications migrations: %w", err)
	}
	return p, nil
}
func Migrate(ctx context.Context, db *sql.DB) error {
	p, err := provider(ctx, db)
	if err != nil {
		return err
	}
	if _, err := p.Up(ctx); err != nil {
		return fmt.Errorf("apply notifications migrations: %w", err)
	}
	return nil
}

// Down is intended only for disposable integration databases.
func Down(ctx context.Context, db *sql.DB) error {
	p, err := provider(ctx, db)
	if err != nil {
		return err
	}
	if _, err := p.DownTo(ctx, 0); err != nil {
		return fmt.Errorf("roll back notifications migrations: %w", err)
	}
	return nil
}
