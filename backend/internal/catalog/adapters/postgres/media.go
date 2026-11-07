package postgres

import (
	"context"
	"errors"

	catalogsql "github.com/freedomCruz/monte-luna/backend/internal/catalog/adapters/postgres/sqlc"
	"github.com/freedomCruz/monte-luna/backend/internal/catalog/domain"
	"github.com/jackc/pgx/v5"
)

func imageVersion(version int32, err error, expected int32) error {
	if errors.Is(err, pgx.ErrNoRows) {
		return &domain.Error{Status: 404, Code: "product_not_found"}
	}
	if err != nil {
		return err
	}
	if version != expected {
		return &domain.Error{Status: 412, Code: "version_conflict"}
	}
	return nil
}
func imageVariant(ctx context.Context, q *catalogsql.Queries, in domain.ImageUpload) error {
	if in.VariantID == nil {
		return nil
	}
	belongs, err := q.ImageVariantBelongs(ctx, catalogsql.ImageVariantBelongsParams{ID: *in.VariantID, ProductID: in.ProductID})
	if err != nil {
		return err
	}
	if !belongs {
		return &domain.Error{Status: 422, Code: "validation_failed", Fields: []domain.FieldError{{Field: "variant_id", Code: "invalid_parameter", Message: "Variant must belong to this product."}}}
	}
	return nil
}
func (r *Repository) CheckImageTarget(ctx context.Context, in domain.ImageUpload) error {
	q := catalogsql.New(r.pool)
	version, err := q.ImageProductVersion(ctx, in.ProductID)
	if err := imageVersion(version, err, in.ProductVersion); err != nil {
		return err
	}
	return imageVariant(ctx, q, in)
}
func (r *Repository) ReserveImage(ctx context.Context, res domain.ImageReservation) error {
	return catalogsql.New(r.pool).ReserveImageUpload(ctx, catalogsql.ReserveImageUploadParams{ID: res.ID, StorageKey: res.StorageKey})
}
func (r *Repository) AttachImage(ctx context.Context, res domain.ImageReservation, in domain.ImageUpload) (image domain.AdminImage, err error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return image, err
	}
	defer rollback(ctx, tx, &err)
	q := catalogsql.New(tx)
	// Both attachment and compensation acquire the ticket first. An ambiguous
	// commit cannot race compensation into deleting an attached object.
	key, err := q.LockImageUpload(ctx, res.ID)
	if err != nil {
		return image, err
	}
	if key != res.StorageKey || res.ProductID != in.ProductID {
		return image, errors.New("image reservation mismatch")
	}
	version, err := q.LockImageProduct(ctx, in.ProductID)
	if err := imageVersion(version, err, in.ProductVersion); err != nil {
		return image, err
	}
	if err := imageVariant(ctx, q, in); err != nil {
		return image, err
	}
	changed, err := q.BumpImageProduct(ctx, catalogsql.BumpImageProductParams{ID: in.ProductID, Version: in.ProductVersion})
	if err != nil {
		return image, err
	}
	if changed != 1 {
		return image, &domain.Error{Status: 412, Code: "version_conflict"}
	}
	row, err := q.InsertAdminImage(ctx, catalogsql.InsertAdminImageParams{ID: res.ID, ProductID: in.ProductID, VariantID: in.VariantID, StorageKey: key, AltText: in.AltText, Position: in.Position})
	if err != nil {
		return image, err
	}
	if err := q.RemoveImageUpload(ctx, res.ID); err != nil {
		return image, err
	}
	if err := tx.Commit(ctx); err != nil {
		return image, err
	}
	return domain.AdminImage{ID: row.ID, ProductID: row.ProductID, VariantID: row.VariantID, StorageKey: row.StorageKey, AltText: row.AltText, Position: row.Position, Version: row.Version, ProductVersion: in.ProductVersion + 1}, nil
}
func (r *Repository) DiscardImage(ctx context.Context, id string, remove func(context.Context, string) error) (err error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer rollback(ctx, tx, &err)
	q := catalogsql.New(tx)
	key, err := q.LockImageUpload(ctx, id)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil
	}
	if err != nil {
		return err
	}
	if err := remove(ctx, key); err != nil {
		return err
	} // Keep ticket on provider failure.
	if err := q.RemoveImageUpload(ctx, id); err != nil {
		return err
	}
	return tx.Commit(ctx)
}
func (r *Repository) AdminImage(ctx context.Context, productID, imageID string) (domain.AdminImage, error) {
	row, err := catalogsql.New(r.pool).ReadAdminImage(ctx, catalogsql.ReadAdminImageParams{ID: imageID, ProductID: productID})
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.AdminImage{}, &domain.Error{Status: 404, Code: "image_not_found"}
	}
	if err != nil {
		return domain.AdminImage{}, err
	}
	return domain.AdminImage{ID: row.ID, ProductID: row.ProductID, VariantID: row.VariantID, StorageKey: row.StorageKey, AltText: row.AltText, Position: row.Position, Version: row.Version, ProductVersion: row.ProductVersion}, nil
}
