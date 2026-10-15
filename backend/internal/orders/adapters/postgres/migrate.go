// Package postgres owns orders schema migrations and generated queries.
package postgres

import (
	"context"
	"database/sql"
	"embed"
	"fmt"
	"github.com/pressly/goose/v3"
	"io/fs"
)

//go:embed migrations/*.sql
var migrationFiles embed.FS

func provider(ctx context.Context, db *sql.DB) (*goose.Provider, error) {
	if _, err := db.ExecContext(ctx, "CREATE SCHEMA IF NOT EXISTS orders"); err != nil {
		return nil, fmt.Errorf("create orders schema: %w", err)
	}
	files, err := fs.Sub(migrationFiles, "migrations")
	if err != nil {
		return nil, fmt.Errorf("open orders migrations: %w", err)
	}
	p, err := goose.NewProvider(goose.DialectPostgres, db, files, goose.WithTableName("orders.goose_db_version"))
	if err != nil {
		return nil, fmt.Errorf("configure orders migrations: %w", err)
	}
	return p, nil
}
func Migrate(ctx context.Context, db *sql.DB) error {
	p, err := provider(ctx, db)
	if err != nil {
		return err
	}
	if _, err := p.Up(ctx); err != nil {
		return fmt.Errorf("apply orders migrations: %w", err)
	}
	return nil
}

// Down is for disposable integration databases only, never a production command.
func Down(ctx context.Context, db *sql.DB) error {
	p, err := provider(ctx, db)
	if err != nil {
		return err
	}
	if _, err := p.DownTo(ctx, 0); err != nil {
		return fmt.Errorf("roll back orders migrations: %w", err)
	}
	return nil
}

// Seed intentionally creates no orders or events. Catalog and shipping own demo
// fixtures; quotes remain read-only and order placement belongs to B3.
func Seed(ctx context.Context, db *sql.DB) error {
	var exists bool
	if err := db.QueryRowContext(ctx, `SELECT to_regclass('orders.orders') IS NOT NULL`).Scan(&exists); err != nil {
		return fmt.Errorf("check orders seed schema: %w", err)
	}
	if !exists {
		return fmt.Errorf("orders schema is not migrated")
	}
	return nil
}
