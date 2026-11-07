package app_test

import (
	"context"
	"errors"
	"testing"

	"github.com/freedomCruz/monte-luna/backend/internal/catalog/app"
	"github.com/freedomCruz/monte-luna/backend/internal/catalog/domain"
)

const imageProduct = "01946894-3d9a-7c98-b807-6c84c1762c2f"
const imageID = "01946894-3d9a-7c98-b807-6c84c1762c30"

type imageStore struct {
	puts, deletes     int
	putErr, deleteErr error
	key               string
}

func (s *imageStore) Resolve(_ context.Context, key string) (string, error) {
	return "https://media.example/" + key, nil
}
func (s *imageStore) Put(_ context.Context, key, _ string, _ []byte) error {
	s.puts++
	s.key = key
	return s.putErr
}
func (s *imageStore) Delete(ctx context.Context, _ string) error {
	s.deletes++
	if ctx.Err() != nil {
		return ctx.Err()
	}
	return s.deleteErr
}

type imageRepo struct {
	checkErr, reserveErr, attachErr error
	reserved, attached, discards    int
	pending                         bool
	store                           *imageStore
}

func (r *imageRepo) CheckImageTarget(context.Context, domain.ImageUpload) error { return r.checkErr }
func (r *imageRepo) ReserveImage(context.Context, domain.ImageReservation) error {
	r.reserved++
	r.pending = r.reserveErr == nil
	return r.reserveErr
}
func (r *imageRepo) AttachImage(_ context.Context, res domain.ImageReservation, in domain.ImageUpload) (domain.AdminImage, error) {
	if r.attachErr != nil {
		return domain.AdminImage{}, r.attachErr
	}
	r.attached++
	r.pending = false
	return domain.AdminImage{ID: res.ID, ProductID: in.ProductID, StorageKey: res.StorageKey, Version: 1, ProductVersion: in.ProductVersion + 1}, nil
}
func (r *imageRepo) DiscardImage(ctx context.Context, _ string, del func(context.Context, string) error) error {
	r.discards++
	if !r.pending {
		return nil
	}
	if err := del(ctx, r.store.key); err != nil {
		return err
	}
	r.pending = false
	return nil
}
func (r *imageRepo) AdminImage(context.Context, string, string) (domain.AdminImage, error) {
	return domain.AdminImage{StorageKey: "images/existing.jpg", ProductVersion: 1}, nil
}

func TestImageUploadOrchestration(t *testing.T) {
	for _, tt := range []struct {
		name                             string
		check, reserve, put, attach, del error
		puts, deletes, attached          int
		pending                          bool
	}{
		{name: "success", puts: 1, attached: 1},
		{name: "stale_before_upload", check: &domain.Error{Status: 412, Code: "version_conflict"}},
		{name: "reserve_failed", reserve: errors.New("database")},
		{name: "storage_failed", put: domain.ErrMediaUnavailable, puts: 1, deletes: 1},
		{name: "db_failed", attach: errors.New("database"), puts: 1, deletes: 1},
		{name: "cleanup_failed_is_durable", attach: errors.New("database"), del: errors.New("storage"), puts: 1, deletes: 1, pending: true},
	} {
		t.Run(tt.name, func(t *testing.T) {
			store := &imageStore{putErr: tt.put, deleteErr: tt.del}
			repo := &imageRepo{checkErr: tt.check, reserveErr: tt.reserve, attachErr: tt.attach, store: store}
			service := app.NewImageService(repo, store, func() (string, error) { return imageID, nil }, func([]byte) string { return "image/png" })
			got, err := service.Upload(t.Context(), domain.ImageUpload{ProductID: imageProduct, ProductVersion: 1, AltText: "Bag", Data: []byte("image"), DeclaredType: "image/png"})
			wantErr := tt.check != nil || tt.reserve != nil || tt.put != nil || tt.attach != nil
			if (err != nil) != wantErr || store.puts != tt.puts || store.deletes != tt.deletes || repo.attached != tt.attached || repo.pending != tt.pending {
				t.Fatalf("image=%+v err=%v store=%+v repo=%+v", got, err, store, repo)
			}
			if !wantErr && (got.ProductVersion != 2 || got.URL != "https://media.example/catalog/products/"+imageProduct+"/"+imageID+".png") {
				t.Fatalf("bad success %+v", got)
			}
		})
	}
}

func TestInvalidImageNeverWrites(t *testing.T) {
	store := &imageStore{}
	repo := &imageRepo{store: store}
	service := app.NewImageService(repo, store, func() (string, error) { return imageID, nil }, func([]byte) string { return "text/html" })
	_, err := service.Upload(t.Context(), domain.ImageUpload{ProductID: imageProduct, ProductVersion: 1, AltText: "Bag", Data: []byte("html"), DeclaredType: "image/jpeg"})
	if err == nil || store.puts != 0 || repo.reserved != 0 {
		t.Fatalf("invalid upload wrote: %v", err)
	}
}
