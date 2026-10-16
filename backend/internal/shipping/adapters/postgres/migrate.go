// Package postgres owns shipping persistence and its embedded schema migrations.
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

// Migrate applies all shipping migrations without loading demo data.
func Migrate(ctx context.Context, db *sql.DB) error {
	provider, err := migrationProvider(ctx, db)
	if err != nil {
		return err
	}
	if _, err := provider.Up(ctx); err != nil {
		return fmt.Errorf("apply shipping migrations: %w", err)
	}
	return nil
}

// Down rolls back shipping migrations. It is intended for isolated test databases,
// not exposed by the migrate command. The schema and version table remain intact.
func Down(ctx context.Context, db *sql.DB) error {
	provider, err := migrationProvider(ctx, db)
	if err != nil {
		return err
	}
	if _, err := provider.DownTo(ctx, 0); err != nil {
		return fmt.Errorf("roll back shipping migrations: %w", err)
	}
	return nil
}

func migrationProvider(ctx context.Context, db *sql.DB) (*goose.Provider, error) {
	// The schema must exist before goose creates its schema-qualified version table.
	if _, err := db.ExecContext(ctx, "CREATE SCHEMA IF NOT EXISTS shipping"); err != nil {
		return nil, fmt.Errorf("create shipping schema: %w", err)
	}
	files, err := fs.Sub(migrationFiles, "migrations")
	if err != nil {
		return nil, fmt.Errorf("open embedded shipping migrations: %w", err)
	}
	provider, err := goose.NewProvider(goose.DialectPostgres, db, files,
		goose.WithTableName("shipping.goose_db_version"))
	if err != nil {
		return nil, fmt.Errorf("configure shipping migrations: %w", err)
	}
	return provider, nil
}
