package app

import (
	"context"
	"github.com/freedomCruz/monte-luna/backend/internal/catalog/domain"
)

type AdminWrites struct {
	repo  domain.AdminWriteRepository
	media domain.MediaResolverPort
}

func NewAdminWrites(repo domain.AdminWriteRepository, media domain.MediaResolverPort) *AdminWrites {
	return &AdminWrites{repo: repo, media: media}
}
func (s *AdminWrites) Write(ctx context.Context, in domain.AdminWrite) (domain.AdminWriteResult, error) {
	if err := domain.ValidateAdminWrite(in); err != nil {
		return domain.AdminWriteResult{}, err
	}
	out, err := s.repo.WriteAdmin(ctx, in)
	if err != nil {
		return out, err
	}
	if out.Product != nil {
		for i := range out.Product.Variants {
			v := &out.Product.Variants[i]
			v.LowStock = domain.LowStock(v.AvailableQuantity)
		}
		for i := range out.Product.Images {
			image := &out.Product.Images[i]
			url, err := s.media.Resolve(ctx, image.StorageKey)
			if err != nil {
				return out, err
			}
			image.URL = url
		}
	}
	if out.Variant != nil {
		out.Variant.LowStock = domain.LowStock(out.Variant.AvailableQuantity)
	}
	return out, nil
}
