package domain

import "testing"

func TestAdminTarget(t *testing.T) {
	tests := []struct{ action, status, want string }{
		{AdminPrepare, "paid", "preparing"},
		{AdminPrepare, "preparing", ""},
		{AdminDeliver, "shipped", "delivered"},
		{AdminDeliver, "preparing", ""},
		{AdminCancel, "paid", "cancelled"},
		{AdminCancel, "preparing", "cancelled"},
		{AdminCancel, "shipped", ""},
		{AdminCancel, "delivered", ""},
		{AdminCancel, "pending_payment", ""},
	}
	for _, tt := range tests {
		if got := AdminTarget(tt.action, tt.status); got != tt.want {
			t.Errorf("AdminTarget(%s,%s)=%q want %q", tt.action, tt.status, got, tt.want)
		}
	}
}

func TestShippedPathAndCancelNote(t *testing.T) {
	if steps, ok := ShippedPath("paid"); !ok || len(steps) != 2 {
		t.Fatal("paid must auto-prepare then ship")
	}
	if steps, ok := ShippedPath("delivered"); !ok || steps != nil {
		t.Fatal("delivered must ignore late shipment events")
	}
	if _, ok := ShippedPath("cancelled"); ok {
		t.Fatal("cancelled order cannot be shipped")
	}
	blank, text := "   ", "  Customer asked  "
	if CancelNote(&blank) != nil || CancelNote(nil) != nil || *CancelNote(&text) != "Customer asked" {
		t.Fatal("cancel note must trim and nil blanks")
	}
}
