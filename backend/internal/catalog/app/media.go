package app

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/freedomCruz/monte-luna/backend/internal/catalog/domain"
)

type ImageService struct {
	repository domain.ImageRepository
	media      domain.MediaStorePort
	newID      func() (string, error)
	sniff      func([]byte) string
}

func NewImageService(repository domain.ImageRepository, media domain.MediaStorePort, newID func() (string, error), sniff func([]byte) string) *ImageService {
	return &ImageService{repository: repository, media: media, newID: newID, sniff: sniff}
}
func (s *ImageService) Upload(ctx context.Context, in domain.ImageUpload) (domain.AdminImage, error) {
	var zero domain.AdminImage
	ext, err := domain.ValidateImageUpload(in, s.sniff(in.Data))
	if err != nil {
		return zero, err
	}
	in.AltText = strings.TrimSpace(in.AltText)
	if err := s.repository.CheckImageTarget(ctx, in); err != nil {
		return zero, err
	}
	id, err := s.newID()
	if err != nil {
		return zero, fmt.Errorf("generate image id: %w", err)
	}
	if !domain.ValidAdminID(id) {
		return zero, errors.New("invalid generated image id")
	}
	reservation := domain.ImageReservation{ID: id, ProductID: in.ProductID, StorageKey: "catalog/products/" + in.ProductID + "/" + id + "." + ext}
	url, err := s.media.Resolve(ctx, reservation.StorageKey)
	if err != nil {
		return zero, err
	}
	// The durable ticket predates PUT: even a crash or a failed compensation
	// leaves a server-owned key for cleanup, without relying on process memory.
	if err := s.repository.ReserveImage(ctx, reservation); err != nil {
		return zero, err
	}
	compensate := func(cause error) error {
		cleanup, cancel := context.WithTimeout(context.WithoutCancel(ctx), 5*time.Second)
		defer cancel()
		if err := s.repository.DiscardImage(cleanup, id, s.media.Delete); err != nil {
			return errors.Join(cause, fmt.Errorf("image cleanup remains recorded: %w", err))
		}
		return cause
	}
	if err := s.media.Put(ctx, reservation.StorageKey, in.DeclaredType, in.Data); err != nil {
		return zero, compensate(domain.ErrMediaUnavailable)
	}
	image, err := s.repository.AttachImage(ctx, reservation, in)
	if err != nil {
		return zero, compensate(err)
	}
	image.URL = url
	return image, nil
}
func (s *ImageService) Image(ctx context.Context, productID, imageID string) (domain.AdminImage, error) {
	image, err := s.repository.AdminImage(ctx, productID, imageID)
	if err != nil {
		return image, err
	}
	image.URL, err = s.media.Resolve(ctx, image.StorageKey)
	return image, err
}
