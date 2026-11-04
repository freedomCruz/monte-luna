// Package adapters provides embedded templates and process-local email capture.
package adapters

import (
	"bytes"
	"context"
	"embed"
	"errors"
	htmltemplate "html/template"
	"net/url"
	"strings"
	texttemplate "text/template"

	"github.com/freedomCruz/monte-luna/backend/internal/notifications/domain"
)

//go:embed templates/*.html templates/*.txt
var templateFiles embed.FS

type TemplateRenderer struct {
	html *htmltemplate.Template
	text *texttemplate.Template
}

var _ domain.Renderer = (*TemplateRenderer)(nil)

func NewTemplateRenderer() (*TemplateRenderer, error) {
	html, err := htmltemplate.New("emails").Option("missingkey=error").ParseFS(templateFiles, "templates/*.html")
	if err != nil {
		return nil, errors.New("invalid embedded HTML templates")
	}
	text, err := texttemplate.New("emails").Option("missingkey=error").ParseFS(templateFiles, "templates/*.txt")
	if err != nil {
		return nil, errors.New("invalid embedded text templates")
	}
	return &TemplateRenderer{html: html, text: text}, nil
}
func (r *TemplateRenderer) Render(ctx context.Context, key string, view domain.TemplateView) (domain.Email, error) {
	if err := ctx.Err(); err != nil {
		return domain.Email{}, err
	}
	var subject string
	switch key {
	case "password_reset":
		subject = "Restablece tu contraseña de administrador de Monteluna"
	case "admin_invitation":
		subject = "Invitación para administrar Monteluna"
		switch view.Role {
		case "owner":
			view.Role = "propietario"
		case "staff":
			view.Role = "equipo"
		default:
			return domain.Email{}, errors.New("invalid admin invitation role")
		}
	case "order_shipped":
		subject = "Tu pedido " + view.OrderNumber + " de Monteluna va en camino"
		if strings.TrimSpace(view.CarrierName) == "" {
			return domain.Email{}, errors.New("shipment email requires a carrier")
		}
		// Shipping accepts only https tracking links; recheck before rendering a href.
		if view.TrackingURL != "" && !safeLink(view.TrackingURL, false) {
			return domain.Email{}, errors.New("invalid tracking link")
		}
	case "order_cancelled":
		subject = "Tu pedido " + view.OrderNumber + " de Monteluna fue cancelado"
	default:
		return domain.Email{}, errors.New("unknown notification template")
	}
	if strings.HasPrefix(key, "order_") {
		if strings.TrimSpace(view.OrderNumber) == "" {
			return domain.Email{}, errors.New("order email requires an order number")
		}
	} else if !safeLink(view.ActionURL, true) {
		return domain.Email{}, errors.New("invalid notification action link")
	}
	var html, text bytes.Buffer
	if err := r.html.ExecuteTemplate(&html, key+".html", view); err != nil {
		return domain.Email{}, errors.New("notification HTML rendering failed")
	}
	if err := r.text.ExecuteTemplate(&text, key+".txt", view); err != nil {
		return domain.Email{}, errors.New("notification text rendering failed")
	}
	return domain.Email{Subject: subject, HTML: html.String(), Text: text.String()}, nil
}

// safeLink rejects relative, credential-bearing and non-web links.
func safeLink(raw string, allowHTTP bool) bool {
	target, err := url.Parse(raw)
	if err != nil || target.Hostname() == "" || target.User != nil {
		return false
	}
	return target.Scheme == "https" || (allowHTTP && target.Scheme == "http")
}
