package adapters_test

import (
	"context"
	"strings"
	"sync"
	"testing"

	"github.com/freedomCruz/monte-luna/backend/internal/notifications/adapters"
	"github.com/freedomCruz/monte-luna/backend/internal/notifications/domain"
)

func TestApprovedEmbeddedTemplates(t *testing.T) {
	renderer, err := adapters.NewTemplateRenderer()
	if err != nil {
		t.Fatal(err)
	}
	for _, tt := range []struct {
		key, subject string
		copy         []string
	}{
		{"password_reset", "Restablece tu contraseña de administrador de Monteluna", []string{"Recibimos una solicitud para restablecer la contraseña de tu cuenta de administrador en Monteluna.", "Restablecer mi contrasena", "Este enlace es de un solo uso y vencera en 30 minutos.", "Si tu no solicitaste este cambio, puedes ignorar este correo; tu contrasena actual continuara siendo segura."}},
		{"admin_invitation", "Invitacion para administrar Monteluna", []string{"Has sido invitado como administrador con el rol de staff en el panel de Monteluna.", "Completar mi registro", "Al definir tu contrasena, se te solicitara configurar tu autenticacion en dos pasos (TOTP).", "Este enlace vencera en 30 minutos."}},
	} {
		t.Run(tt.key, func(t *testing.T) {
			email, err := renderer.Render(context.Background(), tt.key, domain.TemplateView{DisplayName: "<script>alert(1)</script>", Role: "staff", ActionURL: "https://example.test/action?token=FAKE_TOKEN"})
			if err != nil {
				t.Fatal(err)
			}
			if email.Subject != tt.subject {
				t.Fatalf("subject=%q", email.Subject)
			}
			for _, copy := range tt.copy {
				if !strings.Contains(email.HTML, copy) || !strings.Contains(email.Text, copy) {
					t.Fatalf("missing approved copy %q", copy)
				}
			}
			if strings.Contains(email.HTML, "<script>") || !strings.Contains(email.HTML, "&lt;script&gt;") || !strings.Contains(email.Text, "<script>") {
				t.Fatal("incorrect HTML escaping/text fallback")
			}
			if !strings.Contains(email.HTML, `href="https://example.test/action?token=FAKE_TOKEN"`) || !strings.Contains(email.Text, "https://example.test/action?token=FAKE_TOKEN") {
				t.Fatal("missing one-time link")
			}
		})
	}
	for _, url := range []string{"javascript:alert(1)", "data:text/html,secret", "/relative", "https://user:secret@example.test/action"} {
		if _, err := renderer.Render(t.Context(), "password_reset", domain.TemplateView{ActionURL: url}); err == nil {
			t.Fatal("unsafe link accepted")
		}
	}
	if _, err := renderer.Render(t.Context(), "unknown", domain.TemplateView{ActionURL: "https://example.test/"}); err == nil {
		t.Fatal("unknown template accepted")
	}
}

func TestCaptureIsMemoryOnlyIdempotentAndIsolated(t *testing.T) {
	capture := adapters.NewCaptureSender()
	email := domain.Email{MessageID: "019a0000-0000-7000-8000-000000000001", Recipient: "admin@example.test", Subject: "local", HTML: "<a>FAKE_TOKEN</a>", Text: "FAKE_TOKEN"}
	var wg sync.WaitGroup
	results := make(chan domain.SendResult, 8)
	errs := make(chan error, 8)
	for range 8 {
		wg.Go(func() { result, err := capture.Send(t.Context(), email); results <- result; errs <- err })
	}
	wg.Wait()
	close(results)
	close(errs)
	for err := range errs {
		if err != nil {
			t.Fatal(err)
		}
	}
	for result := range results {
		if result.Provider != "capture" || result.MessageID != "capture_"+email.MessageID {
			t.Fatalf("result=%+v", result)
		}
	}
	messages := capture.Messages()
	if len(messages) != 1 || messages[0] != email {
		t.Fatalf("captures=%v", messages)
	}
	messages[0].Text = "changed"
	if capture.Messages()[0].Text != email.Text {
		t.Fatal("capture exposed mutable storage")
	}
	if len(adapters.NewCaptureSender().Messages()) != 0 {
		t.Fatal("capture survived new process-local instance")
	}
	ctx, cancel := context.WithCancel(t.Context())
	cancel()
	if _, err := capture.Send(ctx, email); err == nil {
		t.Fatal("cancelled capture accepted")
	}
	if len(capture.Messages()) != 1 {
		t.Fatal("cancelled call mutated capture")
	}
}
