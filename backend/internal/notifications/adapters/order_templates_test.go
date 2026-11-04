package adapters_test

import (
	"strings"
	"testing"

	"github.com/freedomCruz/monte-luna/backend/internal/notifications/adapters"
	"github.com/freedomCruz/monte-luna/backend/internal/notifications/domain"
)

func TestOrderShippedTemplate(t *testing.T) {
	renderer, err := adapters.NewTemplateRenderer()
	if err != nil {
		t.Fatal(err)
	}
	full := domain.TemplateView{DisplayName: "<b>Ana</b>", OrderNumber: "ML-000123", CarrierName: "Coordinadora", TrackingNumber: "7788", TrackingURL: "https://carrier.example/track?g=7788"}
	email, err := renderer.Render(t.Context(), "order_shipped", full)
	if err != nil {
		t.Fatal(err)
	}
	if email.Subject != "Tu pedido ML-000123 de Monteluna va en camino" {
		t.Fatalf("subject=%q", email.Subject)
	}
	for _, copy := range []string{"Tu pedido ML-000123 ya va en camino.", "Transportadora: Coordinadora", "Número de guía: 7788", "Seguir mi envío"} {
		if !strings.Contains(email.HTML, copy) || !strings.Contains(email.Text, copy) {
			t.Fatalf("missing copy %q", copy)
		}
	}
	if !strings.Contains(email.HTML, `href="https://carrier.example/track?g=7788"`) || !strings.Contains(email.Text, "https://carrier.example/track?g=7788") {
		t.Fatal("missing tracking link")
	}
	if strings.Contains(email.HTML, "<b>Ana</b>") || !strings.Contains(email.HTML, "&lt;b&gt;Ana&lt;/b&gt;") {
		t.Fatal("customer name not escaped")
	}
	bare, err := renderer.Render(t.Context(), "order_shipped", domain.TemplateView{DisplayName: "Ana", OrderNumber: "ML-000123", CarrierName: "Coordinadora"})
	if err != nil {
		t.Fatal(err)
	}
	for _, absent := range []string{"Número de guía", "Seguir mi envío", "href"} {
		if strings.Contains(bare.HTML, absent) || strings.Contains(bare.Text, absent) {
			t.Fatalf("absent optional data rendered %q", absent)
		}
	}
	for _, bad := range []domain.TemplateView{
		{DisplayName: "Ana", OrderNumber: "ML-1", CarrierName: ""},
		{DisplayName: "Ana", OrderNumber: "", CarrierName: "Coordinadora"},
		{DisplayName: "Ana", OrderNumber: "ML-1", CarrierName: "C", TrackingURL: "http://carrier.example/"},
		{DisplayName: "Ana", OrderNumber: "ML-1", CarrierName: "C", TrackingURL: "javascript:alert(1)"},
		{DisplayName: "Ana", OrderNumber: "ML-1", CarrierName: "C", TrackingURL: "https://user:pw@carrier.example/"},
	} {
		if _, err := renderer.Render(t.Context(), "order_shipped", bad); err == nil {
			t.Fatalf("accepted invalid shipped view %+v", bad)
		}
	}
}

func TestOrderCancelledTemplate(t *testing.T) {
	renderer, err := adapters.NewTemplateRenderer()
	if err != nil {
		t.Fatal(err)
	}
	email, err := renderer.Render(t.Context(), "order_cancelled", domain.TemplateView{DisplayName: "Ana", OrderNumber: "ML-000123", Reason: "Sin <stock>"})
	if err != nil {
		t.Fatal(err)
	}
	if email.Subject != "Tu pedido ML-000123 de Monteluna fue cancelado" {
		t.Fatalf("subject=%q", email.Subject)
	}
	for _, copy := range []string{"Tu pedido ML-000123 fue cancelado.", "Si ya realizaste el pago, gestionaremos la devolución de tu dinero."} {
		if !strings.Contains(email.HTML, copy) || !strings.Contains(email.Text, copy) {
			t.Fatalf("missing copy %q", copy)
		}
	}
	if !strings.Contains(email.HTML, "Motivo: Sin &lt;stock&gt;") || !strings.Contains(email.Text, "Motivo: Sin <stock>") {
		t.Fatal("reason missing or unescaped")
	}
	bare, err := renderer.Render(t.Context(), "order_cancelled", domain.TemplateView{DisplayName: "Ana", OrderNumber: "ML-000123"})
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(bare.HTML, "Motivo") || strings.Contains(bare.Text, "Motivo") {
		t.Fatal("absent reason rendered")
	}
}
