package payments_test

import (
	"github.com/freedomCruz/monte-luna/backend/internal/payments"
	"testing"
)

func TestAdminPaymentReadPorts(t *testing.T) {
	db, pool, url := database(t)
	if err := payments.Migrate(t.Context(), db); err != nil {
		t.Fatal(err)
	}
	m, err := payments.New(t.Context(), url, &ordersReader{}, fixtureConfig(), nil, payments.Options{})
	if err != nil {
		t.Fatal(err)
	}
	defer m.Close()
	execute(t, pool, `INSERT INTO payments.payment_attempts(id,order_id,reference,status,amount,currency,expires_at,payment_method_type,created_at) VALUES
 ('0199c4e2-7a1b-7c3d-9e0f-1a2b3c4d5e71',$1,'a','approved',100,'COP',now(),'NEQUI','2026-11-01T00:00:00Z'),
 ('0199c4e2-7a1b-7c3d-9e0f-1a2b3c4d5e72',$1,'b','declined',100,'COP',now(),'CARD','2026-11-02T00:00:00Z'),
 ('0199c4e2-7a1b-7c3d-9e0f-1a2b3c4d5e73',$1,'c','duplicate_approved',100,'COP',now(),'PSE','2026-11-03T00:00:00Z')`, orderID)
	execute(t, pool, `INSERT INTO payments.refunds(payment_attempt_id,order_id,amount,currency,reason,method,status) VALUES('0199c4e2-7a1b-7c3d-9e0f-1a2b3c4d5e71',$1,100,'COP','order_cancelled','manual','pending')`, orderID)
	before := snapshot(t, pool)
	summaries, err := m.AdminPayments(t.Context(), []string{orderID})
	if err != nil || summaries[orderID].Status != "approved" || summaries[orderID].Method == nil || *summaries[orderID].Method != "nequi" {
		t.Fatalf("summaries=%+v err=%v", summaries, err)
	}
	attempts, err := m.PaymentAttempts(t.Context(), orderID)
	if err != nil || len(attempts) != 3 || attempts[2].Status != "duplicate_approved" || attempts[0].Reference != "a" {
		t.Fatalf("attempts=%+v err=%v", attempts, err)
	}
	n, err := m.PendingManualRefunds(t.Context())
	if err != nil || n != 1 {
		t.Fatalf("count=%d err=%v", n, err)
	}
	if snapshot(t, pool) != before {
		t.Fatal("read ports changed stored data")
	}
}
