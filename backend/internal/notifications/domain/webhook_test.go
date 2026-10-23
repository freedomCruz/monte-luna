package domain_test

import (
	"testing"

	"github.com/freedomCruz/monte-luna/backend/internal/notifications/domain"
)

func TestWebhookTransitionsAndSuppression(t *testing.T) {
	for _, tt := range []struct{ current, kind, want string }{
		{"sent", "email.delivered", "delivered"}, {"failed", "email.delivered", "delivered"},
		{"sent", "email.bounced", "bounced"}, {"delivered", "email.bounced", "bounced"},
		{"bounced", "email.delivered", "bounced"}, {"complained", "email.delivered", "complained"},
		{"complained", "email.bounced", "complained"}, {"bounced", "email.complained", "complained"},
		{"suppressed", "email.delivered", "suppressed"},
	} {
		if got := domain.WebhookStatus(tt.current, tt.kind); got != tt.want {
			t.Fatalf("%s/%s=%s want%s", tt.current, tt.kind, got, tt.want)
		}
	}
	for _, tt := range []struct{ kind, bounce, reason string }{
		{"email.bounced", "Permanent", "hard_bounce"}, {"email.bounced", "Temporary", ""}, {"email.bounced", "Unknown", ""}, {"email.complained", "", "complaint"}, {"email.delivered", "", ""},
	} {
		event := domain.ProviderEvent{Type: tt.kind, BounceType: tt.bounce}
		if event.SuppressionReason() != tt.reason {
			t.Fatalf("suppression for %s/%s", tt.kind, tt.bounce)
		}
	}
}
