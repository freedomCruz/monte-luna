package catalog

import (
	"errors"
	"net/http"

	"github.com/freedomCruz/monte-luna/backend/internal/catalog/adapters"
	"github.com/freedomCruz/monte-luna/backend/internal/catalog/adapters/postgres"
	"github.com/freedomCruz/monte-luna/backend/internal/catalog/app"
	"github.com/freedomCruz/monte-luna/backend/internal/catalog/domain"
	"github.com/freedomCruz/monte-luna/backend/internal/identity"
	"github.com/google/uuid"
)

func (m *Module) EnableMedia(cfg MediaConfig) error {
	if err := cfg.Validate(); err != nil {
		return err
	}
	var store domain.MediaStorePort = m.media
	if cfg.Storage == "r2" {
		r2, err := adapters.NewR2(m.mediaBaseURL, cfg.Endpoint, cfg.Bucket, cfg.AccessKeyID, cfg.SecretAccessKey)
		if err != nil {
			return err
		}
		store = r2
	}
	m.images = app.NewImageService(postgres.NewRepository(m.pool), store, func() (string, error) { id, err := uuid.NewV7(); return id.String(), err }, http.DetectContentType)
	return nil
}

func (m *Module) RegisterAdminMediaRoutes(mux *http.ServeMux, access identity.AccessChecker, sessions func(http.Handler) http.Handler) error {
	if mux == nil || sessions == nil || m.images == nil {
		return errors.New("admin media route dependencies are required")
	}
	handler, err := adapters.NewMediaHTTP(m.images, access)
	if err != nil {
		return err
	}
	handler.RegisterRoutes(mux, sessions)
	return nil
}
