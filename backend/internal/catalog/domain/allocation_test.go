package domain_test

import (
	"errors"
	"github.com/freedomCruz/monte-luna/backend/internal/catalog/domain"
	"testing"
)

func TestOldestLotAllocation(t *testing.T) {
	lots := []domain.StockLot{{LotID: "new", ProductionDate: "2026-10-08", Quantity: 4}, {LotID: "old", ProductionDate: "2026-10-01", Quantity: 2}}
	got, err := domain.PlanAllocation("variant", 3, lots)
	if err != nil || len(got) != 2 || got[0].LotID != "old" || got[0].Quantity != 2 || got[1].LotID != "new" || got[1].Quantity != 1 {
		t.Fatalf("%+v/%v", got, err)
	}
	if lots[0].Quantity != 4 || lots[1].Quantity != 2 {
		t.Fatal("planner mutated stock")
	}
	var shortage *domain.InsufficientStockError
	if _, err := domain.PlanAllocation("variant", 7, lots); !errors.As(err, &shortage) {
		t.Fatalf("error=%v", err)
	}
	if _, err := domain.PlanAllocation("variant", 0, lots); err == nil {
		t.Fatal("zero quantity accepted")
	}
}
