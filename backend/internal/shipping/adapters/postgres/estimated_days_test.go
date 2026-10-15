package postgres_test

import (
	"database/sql"
	"errors"
	"os"
	"testing"

	"github.com/freedomCruz/monte-luna/backend/internal/shipping/adapters/postgres"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/pressly/goose/v3"
)

func shippingMigrations(t *testing.T, db *sql.DB) *goose.Provider {
	t.Helper()
	execSQL(t, db, `CREATE SCHEMA IF NOT EXISTS shipping`)
	provider, err := goose.NewProvider(goose.DialectPostgres, db, os.DirFS("migrations"), goose.WithTableName("shipping.goose_db_version"))
	if err != nil {
		t.Fatal(err)
	}
	return provider
}

func TestEstimatedDaysConstraints(t *testing.T) {
	db, _ := migrated(t)
	zone := scalar[string](t, db, `INSERT INTO shipping.shipping_zones(name) VALUES('Estimates') RETURNING id`)
	for _, tc := range []struct {
		name     string
		min, max any
		state    string
	}{
		{"null minimum", nil, 5, "23502"},
		{"null maximum", 3, nil, "23502"},
		{"both null", nil, nil, "23502"},
		{"zero minimum", 0, 5, "23514"},
		{"negative minimum", -1, 5, "23514"},
		{"reversed range", 3, 2, "23514"},
		{"zero maximum", 3, 0, "23514"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			before := snapshot(t, db)
			_, err := db.ExecContext(t.Context(), `INSERT INTO shipping.shipping_rates(zone_id,name,price_amount,estimated_days_min,estimated_days_max) VALUES($1,'Invalid',100,$2,$3)`, zone, tc.min, tc.max)
			var pgError *pgconn.PgError
			if !errors.As(err, &pgError) || pgError.Code != tc.state {
				t.Fatalf("error = %v; want SQLSTATE %s", err, tc.state)
			}
			if snapshot(t, db) != before {
				t.Fatal("rejected estimate changed stored data")
			}
		})
	}
	for _, days := range [][2]int{{1, 1}, {3, 5}} {
		execSQL(t, db, `INSERT INTO shipping.shipping_rates(zone_id,name,price_amount,estimated_days_min,estimated_days_max) VALUES($1,'Valid',100,$2,$3)`, zone, days[0], days[1])
	}
	before := snapshot(t, db)
	_, err := db.ExecContext(t.Context(), `UPDATE shipping.shipping_rates SET estimated_days_min=0`)
	if err == nil {
		t.Fatal("invalid update accepted")
	}
	if snapshot(t, db) != before {
		t.Fatal("invalid update changed data")
	}
}

func TestEstimatedDaysMigrationRoundTrip(t *testing.T) {
	db, _ := database(t)
	provider := shippingMigrations(t, db)
	if _, err := provider.UpTo(t.Context(), 1); err != nil {
		t.Fatal(err)
	}
	zone := scalar[string](t, db, `INSERT INTO shipping.shipping_zones(name) VALUES('Legacy') RETURNING id`)
	execSQL(t, db, `INSERT INTO shipping.shipping_rates(zone_id,name,price_amount,estimated_days_min,estimated_days_max) VALUES($1,'Legacy rate',100,1,2)`, zone)
	before := snapshot(t, db)
	if err := postgres.Migrate(t.Context(), db); err != nil {
		t.Fatal(err)
	}
	if snapshot(t, db) != before {
		t.Fatal("upgrade rewrote stored estimates")
	}
	if version, err := provider.GetDBVersion(t.Context()); err != nil || version != 2 {
		t.Fatalf("version=%d error=%v", version, err)
	}
	if _, err := provider.Down(t.Context()); err != nil {
		t.Fatal(err)
	}
	// Down restores nullable, nonnegative values and the old ordering constraint.
	for _, days := range [][2]any{{nil, nil}, {nil, 0}, {0, nil}, {0, 0}} {
		execSQL(t, db, `UPDATE shipping.shipping_rates SET estimated_days_min=$1,estimated_days_max=$2`, days[0], days[1])
	}
	for _, days := range [][2]any{{-1, 2}, {nil, -1}, {3, 2}} {
		beforeRejected := snapshot(t, db)
		if _, err := db.ExecContext(t.Context(), `UPDATE shipping.shipping_rates SET estimated_days_min=$1,estimated_days_max=$2`, days[0], days[1]); err == nil {
			t.Fatal("Down did not restore old checks")
		}
		if snapshot(t, db) != beforeRejected {
			t.Fatal("rejected legacy estimate changed data")
		}
	}
	execSQL(t, db, `UPDATE shipping.shipping_rates SET estimated_days_min=1,estimated_days_max=2`)
	if err := postgres.Migrate(t.Context(), db); err != nil {
		t.Fatal(err)
	}
	if snapshot(t, db) != before {
		t.Fatal("up/down/up changed business data")
	}
	if version, err := provider.GetDBVersion(t.Context()); err != nil || version != 2 {
		t.Fatalf("version=%d error=%v", version, err)
	}
}

func TestEstimatedDaysMigrationRejectsInvalidLegacyRowsWithoutBackfill(t *testing.T) {
	db, _ := database(t)
	provider := shippingMigrations(t, db)
	if _, err := provider.UpTo(t.Context(), 1); err != nil {
		t.Fatal(err)
	}
	zone := scalar[string](t, db, `INSERT INTO shipping.shipping_zones(name) VALUES('Legacy invalid') RETURNING id`)
	for _, tc := range []struct {
		name     string
		min, max any
	}{
		{"null minimum", nil, 5}, {"null maximum", 3, nil}, {"both null", nil, nil}, {"zero minimum", 0, 0},
	} {
		t.Run(tc.name, func(t *testing.T) {
			execSQL(t, db, `INSERT INTO shipping.shipping_rates(zone_id,name,price_amount,estimated_days_min,estimated_days_max) VALUES($1,'Needs merchant correction',100,$2,$3)`, zone, tc.min, tc.max)
			before := snapshot(t, db)
			history := scalar[string](t, db, `SELECT jsonb_agg(to_jsonb(v) ORDER BY id)::text FROM shipping.goose_db_version v`)
			err := postgres.Migrate(t.Context(), db)
			var pgError *pgconn.PgError
			wantState := "23502"
			if tc.min == 0 {
				wantState = "23514"
			}
			if !errors.As(err, &pgError) || pgError.Code != wantState {
				t.Fatalf("upgrade error = %v, want PostgreSQL estimate failure %s", err, wantState)
			}
			if snapshot(t, db) != before {
				t.Fatal("failed upgrade modified business data")
			}
			if scalar[string](t, db, `SELECT jsonb_agg(to_jsonb(v) ORDER BY id)::text FROM shipping.goose_db_version v`) != history {
				t.Fatal("failed migration advanced history")
			}
			// Failed DDL must roll back all new checks and leave version 1 operational.
			execSQL(t, db, `UPDATE shipping.shipping_rates SET estimated_days_min=NULL,estimated_days_max=NULL`)
			execSQL(t, db, `DELETE FROM shipping.shipping_rates`)
		})
	}
}
