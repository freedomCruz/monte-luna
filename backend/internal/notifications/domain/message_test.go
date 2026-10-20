package domain_test

import (
	"errors"
	"testing"

	"github.com/freedomCruz/monte-luna/backend/internal/notifications/domain"
)

func TestIntakeValidation(t *testing.T) {
	valid := domain.Intake{SourceEventID: "019a0000-0000-7000-8000-000000000001", EventType: "identity.password_reset_requested", TemplateKey: "password_reset", RecipientEmail: "Admin@Example.COM", TemplateData: domain.TemplateData{DisplayName: "Admin"}}
	for _, tt := range []struct {
		name    string
		change  func(*domain.Intake)
		invalid bool
	}{
		{"reset", func(*domain.Intake) {}, false},
		{"invitation", func(v *domain.Intake) { v.EventType = "identity.admin_invited"; v.TemplateKey = "admin_invitation" }, false},
		{"invalid source", func(v *domain.Intake) { v.SourceEventID = "not-uuid" }, true},
		{"unsupported event", func(v *domain.Intake) { v.EventType = "orders.order_paid" }, true},
		{"invalid key", func(v *domain.Intake) { v.TemplateKey = "Password reset" }, true},
		{"empty recipient", func(v *domain.Intake) { v.RecipientEmail = "" }, true},
		{"invalid recipient", func(v *domain.Intake) { v.RecipientEmail = "Admin <admin@example.com>" }, true},
	} {
		t.Run(tt.name, func(t *testing.T) {
			input := valid
			tt.change(&input)
			err := input.Validate()
			if tt.invalid && !errors.Is(err, domain.ErrInvalidIntake) {
				t.Fatalf("error=%v", err)
			}
			if !tt.invalid && err != nil {
				t.Fatal(err)
			}
		})
	}
}
