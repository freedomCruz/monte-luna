package postgres_test

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"testing"
	"time"

	"github.com/freedomCruz/monte-luna/backend/internal/shipping"
	"github.com/freedomCruz/monte-luna/backend/internal/shipping/adapters/postgres"
	"github.com/freedomCruz/monte-luna/backend/internal/shipping/domain"
	"github.com/jackc/pgx/v5/pgxpool"
	_ "github.com/jackc/pgx/v5/stdlib"
	"github.com/testcontainers/testcontainers-go"
	pgcontainer "github.com/testcontainers/testcontainers-go/modules/postgres"
)

const postgresImage = "postgres:18.6-bookworm@sha256:afc7e2d441324c0388fa80c3d24f733b4194a4eb7f47dd8ee2b08eb1a24a647c"

func database(t *testing.T) (*sql.DB, string) {
	t.Helper()
	ctx, cancel := context.WithTimeout(t.Context(), 2*time.Minute)
	defer cancel()
	container, err := pgcontainer.Run(ctx, postgresImage, pgcontainer.WithDatabase("shipping_test"), pgcontainer.WithUsername("shipping_test"), pgcontainer.WithPassword("shipping_test"), pgcontainer.BasicWaitStrategies())
	if err != nil {
		t.Fatal(err)
	}
	testcontainers.CleanupContainer(t, container)
	url, err := container.ConnectionString(ctx, "sslmode=disable")
	if err != nil {
		t.Fatal(err)
	}
	db, err := sql.Open("pgx", url)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if err := db.Close(); err != nil {
			t.Error(err)
		}
	})
	return db, url
}
func execSQL(t *testing.T, db *sql.DB, query string, args ...any) {
	t.Helper()
	if _, err := db.ExecContext(t.Context(), query, args...); err != nil {
		t.Fatal(err)
	}
}
func scalar[T any](t *testing.T, db *sql.DB, query string, args ...any) T {
	t.Helper()
	var result T
	if err := db.QueryRowContext(t.Context(), query, args...).Scan(&result); err != nil {
		t.Fatal(err)
	}
	return result
}
func snapshot(t *testing.T, db *sql.DB) string {
	t.Helper()
	var result string
	for _, table := range []string{"shipping_zones", "shipping_zone_areas", "shipping_rates"} {
		result += scalar[string](t, db, fmt.Sprintf(`SELECT COALESCE(jsonb_agg(to_jsonb(r) ORDER BY id),'[]'::jsonb)::text FROM shipping.%s r`, table))
	}
	return result
}
func migrated(t *testing.T) (*sql.DB, string) {
	t.Helper()
	db, url := database(t)
	if err := postgres.Migrate(t.Context(), db); err != nil {
		t.Fatal(err)
	}
	return db, url
}
func pointer[T any](v T) *T { return &v }
func repository(t *testing.T, url string) *postgres.Repository {
	t.Helper()
	pool, err := pgxpool.New(t.Context(), url)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(pool.Close)
	return postgres.NewRepository(pool)
}

func TestMigrationsRoundTripAndConstraints(t *testing.T) {
	db, _ := database(t)
	for range 2 {
		if err := postgres.Migrate(t.Context(), db); err != nil {
			t.Fatal(err)
		}
		if err := postgres.Migrate(t.Context(), db); err != nil {
			t.Fatal(err)
		}
		if scalar[bool](t, db, `SELECT to_regclass('public.goose_db_version') IS NOT NULL`) {
			t.Fatal("version table leaked into public")
		}
		if got := scalar[int](t, db, `SELECT count(*) FROM shipping.shipping_zones`); got != 0 {
			t.Fatalf("migrations seeded %d rows", got)
		}
		zone := scalar[string](t, db, `INSERT INTO shipping.shipping_zones(name) VALUES('Test') RETURNING id`)
		if scalar[string](t, db, `SELECT uuid_extract_version(id)::text FROM shipping.shipping_zones WHERE id=$1`, zone) != "7" {
			t.Fatal("zone is not UUIDv7")
		}
		for _, tc := range []struct{ name, query string }{
			{"duplicate zone", `INSERT INTO shipping.shipping_zones(name) VALUES('Test')`},
			{"bad status", `UPDATE shipping.shipping_zones SET status='draft'`},
			{"bad department", `INSERT INTO shipping.shipping_zone_areas(zone_id,department_code) VALUES($1,'5')`},
			{"bad municipality", `INSERT INTO shipping.shipping_zone_areas(zone_id,department_code,municipality_code) VALUES($1,'05','0500')`},
			{"mismatched department", `INSERT INTO shipping.shipping_zone_areas(zone_id,department_code,municipality_code) VALUES($1,'11','05001')`},
			{"negative price", `INSERT INTO shipping.shipping_rates(zone_id,name,price_amount,estimated_days_min,estimated_days_max) VALUES($1,'Bad',-1,3,5)`},
			{"invalid currency", `INSERT INTO shipping.shipping_rates(zone_id,name,price_amount,currency,estimated_days_min,estimated_days_max) VALUES($1,'Bad',1,'cop',3,5)`},
			{"negative band", `INSERT INTO shipping.shipping_rates(zone_id,name,price_amount,min_weight_grams,estimated_days_min,estimated_days_max) VALUES($1,'Bad',1,-1,3,5)`},
			{"empty band", `INSERT INTO shipping.shipping_rates(zone_id,name,price_amount,min_weight_grams,max_weight_grams,estimated_days_min,estimated_days_max) VALUES($1,'Bad',1,10,10,3,5)`},
			{"zero threshold", `INSERT INTO shipping.shipping_rates(zone_id,name,price_amount,free_shipping_threshold_amount,estimated_days_min,estimated_days_max) VALUES($1,'Bad',1,0,3,5)`},
			{"reversed days", `INSERT INTO shipping.shipping_rates(zone_id,name,price_amount,estimated_days_min,estimated_days_max) VALUES($1,'Bad',1,3,2)`},
			{"negative days", `INSERT INTO shipping.shipping_rates(zone_id,name,price_amount,estimated_days_min,estimated_days_max) VALUES($1,'Bad',1,-1,5)`},
			{"rate status", `INSERT INTO shipping.shipping_rates(zone_id,name,price_amount,status,estimated_days_min,estimated_days_max) VALUES($1,'Bad',1,'draft',3,5)`},
		} {
			t.Run(tc.name, func(t *testing.T) {
				before := snapshot(t, db)
				var err error
				if tc.name == "duplicate zone" || tc.name == "bad status" {
					_, err = db.ExecContext(t.Context(), tc.query)
				} else {
					_, err = db.ExecContext(t.Context(), tc.query, zone)
				}
				if err == nil {
					t.Fatal("invalid record accepted")
				}
				if snapshot(t, db) != before {
					t.Fatal("rejection changed data")
				}
			})
		}
		execSQL(t, db, `INSERT INTO shipping.shipping_zone_areas(zone_id,department_code,municipality_code) VALUES($1,'05',NULL),($1,'05','05001')`, zone)
		for _, municipality := range []*string{nil, pointer("05001")} {
			before := snapshot(t, db)
			_, err := db.ExecContext(t.Context(), `INSERT INTO shipping.shipping_zone_areas(zone_id,department_code,municipality_code) VALUES($1,'05',$2)`, zone, municipality)
			if err == nil {
				t.Fatal("duplicate geographic coverage accepted")
			}
			if snapshot(t, db) != before {
				t.Fatal("rejected coverage changed data")
			}
		}
		if err := postgres.Down(t.Context(), db); err != nil {
			t.Fatal(err)
		}
		if n := scalar[int](t, db, `SELECT count(*) FROM information_schema.tables WHERE table_schema='shipping' AND table_name<>'goose_db_version'`); n != 0 {
			t.Fatalf("down left %d tables", n)
		}
	}
	if err := postgres.Migrate(t.Context(), db); err != nil {
		t.Fatal(err)
	}
}

func TestQuoteResolutionThroughPublicPort(t *testing.T) {
	db, url := migrated(t)
	if err := postgres.Seed(t.Context(), db); err != nil {
		t.Fatal(err)
	}
	module, err := shipping.New(t.Context(), url)
	if err != nil {
		t.Fatal(err)
	}
	defer module.Close()
	for _, tc := range []struct {
		name, code, rate string
		weight           int32
		subtotal, amount int64
		regular          int64
		free             bool
		min, max         int32
		unsupported      bool
	}{
		{"municipality wins", "05001", "Demo standard parcel", 1000, 0, 1000000, 1000000, false, 3, 5, false},
		{"department fallback", "05002", "Demo standard parcel", 1, 0, 1500000, 1500000, false, 3, 5, false},
		{"next band", "05002", "Demo heavy parcel", 1001, 0, 2000000, 2000000, false, 3, 5, false},
		{"unbounded band", "05001", "Demo heavy parcel", 2147483647, 0, 1500000, 1500000, false, 3, 5, false},
		{"threshold", "11001", "Demo standard parcel", 1000, 15000000, 0, 800000, true, 3, 5, false},
		{"below threshold", "11001", "Demo standard parcel", 1000, 14999999, 800000, 800000, false, 3, 5, false},
		{"unsupported destination", "76001", "", 1, 0, 0, 0, false, 0, 0, true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			before := snapshot(t, db)
			got, err := module.Quote(t.Context(), shipping.QuoteInput{MunicipalityCode: tc.code, TotalWeightGrams: tc.weight, OrderSubtotal: tc.subtotal})
			if tc.unsupported {
				var target *shipping.UnsupportedDestinationError
				if !errors.As(err, &target) {
					t.Fatalf("error = %v", err)
				}
			} else if err != nil || got.RateName != tc.rate || got.Amount != tc.amount || got.RegularAmount != tc.regular || got.Currency != "COP" || got.FreeShipping != tc.free || got.EstimatedDaysMin != tc.min || got.EstimatedDaysMax != tc.max {
				t.Fatalf("quote = %+v, error = %v", got, err)
			}
			if snapshot(t, db) != before {
				t.Fatal("quote changed stored data")
			}
		})
	}
	// Specific zone selection happens before rate selection, never fallback by weight.
	execSQL(t, db, `UPDATE shipping.shipping_rates SET status='archived' WHERE zone_id=(SELECT id FROM shipping.shipping_zones WHERE name='Demo Medellín')`)
	_, err = module.Quote(t.Context(), shipping.QuoteInput{MunicipalityCode: "05001", TotalWeightGrams: 250})
	var unsupported *shipping.UnsupportedDestinationError
	if !errors.As(err, &unsupported) {
		t.Fatalf("archived rates error = %v", err)
	}
	execSQL(t, db, `UPDATE shipping.shipping_zones SET status='archived' WHERE name='Demo Medellín'`)
	got, err := module.Quote(t.Context(), shipping.QuoteInput{MunicipalityCode: "05001", TotalWeightGrams: 250})
	if err != nil || got.Amount != 1500000 {
		t.Fatalf("archived municipality zone fallback = %+v/%v", got, err)
	}
	execSQL(t, db, `UPDATE shipping.shipping_zones SET status='archived' WHERE name='Demo Antioquia'`)
	_, err = module.Quote(t.Context(), shipping.QuoteInput{MunicipalityCode: "05001", TotalWeightGrams: 250})
	if !errors.As(err, &unsupported) {
		t.Fatalf("archived zones error = %v", err)
	}
	_, err = module.LookupMunicipality("99999")
	var unknown *shipping.UnknownMunicipalityError
	if !errors.As(err, &unknown) {
		t.Fatalf("lookup error = %v", err)
	}
}

func TestAreaAndRateWritesValidateBeforePersistence(t *testing.T) {
	db, url := migrated(t)
	repo := repository(t, url)
	zone := scalar[string](t, db, `INSERT INTO shipping.shipping_zones(name) VALUES('Write test') RETURNING id`)
	for _, tc := range []struct {
		department   string
		municipality *string
	}{
		{"00", nil}, {"99", pointer("99999")}, {"11", pointer("05001")},
	} {
		before := snapshot(t, db)
		if err := repo.AddArea(t.Context(), zone, tc.department, tc.municipality); err == nil {
			t.Fatal("invalid area accepted")
		}
		if snapshot(t, db) != before {
			t.Fatal("rejected area changed data")
		}
	}
	if err := repo.AddArea(t.Context(), zone, "05", pointer("05001")); err != nil {
		t.Fatal(err)
	}
	rate := domain.Rate{ZoneID: zone, Name: "Standard", PriceAmount: 100, Currency: "COP", MaxWeightGrams: pointer(int32(1000)), EstimatedDaysMin: 3, EstimatedDaysMax: 5, Status: "active"}
	id, err := repo.CreateRate(t.Context(), rate)
	if err != nil {
		t.Fatal(err)
	}
	if scalar[string](t, db, `SELECT uuid_extract_version(id)::text FROM shipping.shipping_rates WHERE id=$1`, id) != "7" {
		t.Fatal("rate is not UUIDv7")
	}
	before := snapshot(t, db)
	rate.MinWeightGrams = 1000
	rate.MaxWeightGrams = nil
	if _, err := repo.CreateRate(t.Context(), rate); err == nil {
		t.Fatal("inclusive overlap accepted")
	}
	if snapshot(t, db) != before {
		t.Fatal("rejected overlap changed data")
	}
	// A caller-supplied ID must not turn insertion into update-style validation.
	rate.ID = id
	if _, err := repo.CreateRate(t.Context(), rate); err == nil {
		t.Fatal("caller-supplied existing ID bypassed overlap validation")
	}
	if snapshot(t, db) != before {
		t.Fatal("rejected caller-supplied ID changed data")
	}
	rate.ID = ""
	rate.MinWeightGrams = 1001
	rate.Name = "Heavy"
	if _, err := repo.CreateRate(t.Context(), rate); err != nil {
		t.Fatal(err)
	}
}

func TestSeedIdempotentAndPreservesMerchantEdits(t *testing.T) {
	db, _ := migrated(t)
	if err := postgres.Seed(t.Context(), db); err != nil {
		t.Fatal(err)
	}
	if got := scalar[int](t, db, `SELECT count(*) FROM shipping.shipping_rates WHERE estimated_days_min=3 AND estimated_days_max=5`); got != 6 {
		t.Fatalf("demo rates with 3 to 5 business days = %d, want 6", got)
	}
	for _, tc := range []struct {
		table string
		want  int
	}{{"shipping_zones", 3}, {"shipping_zone_areas", 3}, {"shipping_rates", 6}} {
		if got := scalar[int](t, db, fmt.Sprintf(`SELECT count(*) FROM shipping.%s`, tc.table)); got != tc.want {
			t.Fatalf("%s rows = %d", tc.table, got)
		}
	}
	before := snapshot(t, db)
	if err := postgres.Seed(t.Context(), db); err != nil {
		t.Fatal(err)
	}
	if snapshot(t, db) != before {
		t.Fatal("reseed changed data")
	}
	execSQL(t, db, `UPDATE shipping.shipping_rates SET price_amount=12345,estimated_days_min=4,estimated_days_max=7,version=version+1,updated_at=now();UPDATE shipping.shipping_zones SET status='archived',version=version+1,updated_at=now()`)
	before = snapshot(t, db)
	if err := postgres.Seed(t.Context(), db); err != nil {
		t.Fatal(err)
	}
	if snapshot(t, db) != before {
		t.Fatal("reseed overwrote merchant data")
	}
}
func TestSeedFailureRollsBackEverything(t *testing.T) {
	db, _ := migrated(t)
	execSQL(t, db, `ALTER TABLE shipping.shipping_rates ADD CONSTRAINT reject_heavy CHECK(name<>'Demo heavy parcel')`)
	before := snapshot(t, db)
	if err := postgres.Seed(t.Context(), db); err == nil {
		t.Fatal("seed accepted rejected rate")
	}
	if snapshot(t, db) != before {
		t.Fatal("failed seed changed data")
	}
}
