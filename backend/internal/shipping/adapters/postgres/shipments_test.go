package postgres_test

import (
	"database/sql"
	"testing"
)

func shipmentRows(t *testing.T, db *sql.DB) string {
	t.Helper()
	return scalar[string](t, db, `SELECT COALESCE(jsonb_agg(to_jsonb(s) ORDER BY id),'[]')::text FROM shipping.shipments s`)
}
func TestShipmentMigrationConstraints(t *testing.T) {
	db, _ := migrated(t)
	const orderID = "01946894-3d9a-7c98-b807-6c84c1762c2f"
	execSQL(t, db, `INSERT INTO shipping.shipments(order_id) VALUES($1)`, orderID)
	if scalar[int](t, db, `SELECT version FROM shipping.shipments`) != 1 || !scalar[bool](t, db, `SELECT carrier_name IS NULL FROM shipping.shipments`) {
		t.Fatal("invalid pending defaults")
	}
	if scalar[int](t, db, `SELECT uuid_extract_version(id) FROM shipping.shipments`) != 7 {
		t.Fatal("shipment must use UUIDv7")
	}
	for _, tt := range []struct{ name, query string }{
		{"duplicate order", `INSERT INTO shipping.shipments(order_id) SELECT order_id FROM shipping.shipments`},
		{"unknown status", `UPDATE shipping.shipments SET status='lost'`},
		{"zero version", `UPDATE shipping.shipments SET version=0`},
		{"missing carrier", `UPDATE shipping.shipments SET status='shipped',shipped_at=now()`},
		{"blank carrier", `UPDATE shipping.shipments SET status='shipped',shipped_at=now(),carrier_name='  '`},
		{"missing shipment time", `UPDATE shipping.shipments SET status='shipped',carrier_name='Carrier'`},
		{"missing delivery time", `UPDATE shipping.shipments SET status='delivered',shipped_at=now(),carrier_name='Carrier'`},
		{"pending shipped time", `UPDATE shipping.shipments SET shipped_at=now()`},
	} {
		t.Run(tt.name, func(t *testing.T) {
			before := shipmentRows(t, db)
			if _, err := db.ExecContext(t.Context(), tt.query); err == nil {
				t.Fatal("invalid shipment accepted")
			}
			if shipmentRows(t, db) != before {
				t.Fatal("constraint rejection changed rows/versions")
			}
		})
	}
	if scalar[int](t, db, `SELECT count(*) FROM pg_indexes WHERE schemaname='shipping' AND indexname='shipments_status_created_idx'`) != 1 {
		t.Fatal("missing fulfillment listing index")
	}
	if scalar[int](t, db, `SELECT count(*) FROM pg_constraint WHERE conrelid='shipping.shipments'::regclass AND contype='f'`) != 0 {
		t.Fatal("shipment leaked cross-schema FK")
	}
}
