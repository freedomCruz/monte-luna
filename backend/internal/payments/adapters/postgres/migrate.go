// Package postgres owns isolated payments persistence.
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
	if _, err := db.ExecContext(ctx, "CREATE SCHEMA IF NOT EXISTS payments"); err != nil {
		return nil, fmt.Errorf("create payments schema: %w", err)
	}
	files, err := fs.Sub(migrationFiles, "migrations")
	if err != nil {
		return nil, err
	}
	return goose.NewProvider(goose.DialectPostgres, db, files, goose.WithTableName("payments.goose_db_version"))
}
func Migrate(ctx context.Context, db *sql.DB) error {
	p, err := provider(ctx, db)
	if err != nil {
		return err
	}
	_, err = p.Up(ctx)
	return err
}

// Down is restricted to disposable test databases; no production CLI exposes it.
func Down(ctx context.Context, db *sql.DB) error {
	p, err := provider(ctx, db)
	if err != nil {
		return err
	}
	_, err = p.DownTo(ctx, 0)
	return err
}
